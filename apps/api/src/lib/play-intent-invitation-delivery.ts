/** Serializes invitation sends across API workers and reconciles late delivery with call cleanup. */
import { Pool } from 'pg'
import { env } from './env.js'
import { prisma } from './prisma.js'
import {
  archivePlayIntentDirectMessages,
  deletePlayIntentDirectMessages,
} from './discord-dm-cleanup.js'
import { refreshTrackedPlayIntentNotificationDirectMessages } from './play-intent-notification-responses.js'
import { logger } from './logger.js'

// Lock ownership uses a separate, bounded session pool. Waiters never occupy the
// application query pool, and ownership cannot expire while Discord is still working.
const deliveryLockPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
  application_name: 'game-is-up-invitation-delivery',
})

deliveryLockPool.on('error', (error) => {
  logger.error('Invitation delivery lock connection failed', { error })
})

export type DeliverableInvitationNotification = NonNullable<
  Awaited<ReturnType<typeof loadNotification>>
>

/** Holds a pinned session lock through delivery and reconciliation, releasing it even on failure. */
export async function withPlayIntentInvitationDelivery<T>(
  notificationId: string,
  deliver: (
    notification: DeliverableInvitationNotification,
    signal: AbortSignal,
  ) => Promise<T>,
): Promise<T | null> {
  const connection = await deliveryLockPool.connect()
  const lockKey = `ctp-delivery:${notificationId}`
  let destroyConnection = false
  const controller = new AbortController()
  const handleConnectionError = (error: Error) => {
    destroyConnection = true
    controller.abort(error)
    logger.error('Invitation delivery lost lock ownership', {
      notificationId,
      error,
    })
  }
  connection.on('error', handleConnectionError)
  try {
    await connection.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      lockKey,
    ])
    const notification = await loadNotification(notificationId)
    if (
      !notification?.playIntent ||
      notification.playIntent.deletedAt ||
      notification.playIntent.expiresAt <= new Date()
    ) {
      return null
    }

    try {
      const result = await deliver(notification, controller.signal)
      // In-flight Discord work may have completed after ownership was lost. Reconcile
      // its tracking below, but report the result as uncertain rather than success.
      controller.signal.throwIfAborted()
      return result
    } finally {
      // Cleanup may have finished before the send returned its new message reference.
      const current = await prisma.playIntent.findUnique({
        where: { id: notification.playIntent.id },
      })
      if (!current || current.deletedAt) {
        await deletePlayIntentDirectMessages(notification.playIntent.id)
      } else if (current.expiresAt <= new Date()) {
        await archivePlayIntentDirectMessages({ playIntentIds: [current.id] })
      } else {
        // An edit or response during the send must be reflected in its final visible state.
        await refreshTrackedPlayIntentNotificationDirectMessages({
          playIntentIds: [current.id],
          userIds: [notification.userId],
        })
      }
    }
  } finally {
    try {
      await connection.query(
        'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
        [lockKey],
      )
    } catch (error) {
      destroyConnection = true
      logger.error('Unable to release invitation delivery lock', {
        notificationId,
        error,
      })
    } finally {
      connection.removeListener('error', handleConnectionError)
      connection.release(destroyConnection)
    }
  }
}

/** Loads live content and tracking after acquiring the delivery lock, rather than using preparation snapshots. */
async function loadNotification(notificationId: string) {
  return prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      playIntent: {
        include: {
          user: true,
          games: { include: { game: true } },
          targetFriends: { include: { friendUser: true } },
          targetDiscordServers: { include: { server: true } },
        },
      },
    },
  })
}
