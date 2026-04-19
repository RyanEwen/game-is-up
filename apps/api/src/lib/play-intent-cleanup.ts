import { NotificationType } from '@prisma/client'
import { sweepOldDiscordDirectMessages } from './discord-dm-cleanup.js'
import { refreshTrackedDiscordAutoPlayPromptDirectMessages } from './discord-auto-play-prompts.js'
import {
  expirePendingPlayIntentNotifications,
  refreshTrackedCreatorPlayIntentSummaryMessages,
  refreshTrackedPlayIntentNotificationDirectMessages,
  sweepScheduledPlayIntentCreatorCheckIns
} from './play-intent-notification-responses.js'
import {
  sweepDeleteDuePlayIntentDiscordSpaces,
  sweepProvisionPendingPlayIntentDiscordSpaces
} from './play-intent-discord-spaces.js'
import { prisma } from './prisma.js'

const playIntentCleanupIntervalMs = 60 * 1000
const staleDiscordDmSweepIntervalMs = 60 * 60 * 1000

let cleanupLoopStarted = false
let cleanupInFlight = false
let lastStaleDiscordDmSweepStartedAt = 0
let trackedDiscordDmRefreshCompleted = false

export async function sweepExpiredPlayIntentNotifications() {
  const expiredIntentIds = (await prisma.playIntent.findMany({
    where: {
      expiresAt: {
        lte: new Date()
      },
      notifications: {
        some: {
          type: {
            in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN]
          },
          respondedAt: null
        }
      }
    },
    select: {
      id: true
    }
  })).map((intent) => intent.id)

  await expirePendingPlayIntentNotifications(expiredIntentIds)
}

async function runCleanupSweep() {
  if (cleanupInFlight) {
    return
  }

  cleanupInFlight = true

  try {
    if (!trackedDiscordDmRefreshCompleted) {
      await refreshTrackedPlayIntentNotificationDirectMessages()
      await refreshTrackedDiscordAutoPlayPromptDirectMessages()
      await refreshTrackedCreatorPlayIntentSummaryMessages()
      trackedDiscordDmRefreshCompleted = true
    }

    await sweepScheduledPlayIntentCreatorCheckIns()
    await sweepProvisionPendingPlayIntentDiscordSpaces()
    await sweepDeleteDuePlayIntentDiscordSpaces()
    await sweepExpiredPlayIntentNotifications()

    if (Date.now() - lastStaleDiscordDmSweepStartedAt >= staleDiscordDmSweepIntervalMs) {
      lastStaleDiscordDmSweepStartedAt = Date.now()
      await sweepOldDiscordDirectMessages()
    }
  } catch (error) {
    console.error('Failed to sweep play-intent notification jobs', error)
  } finally {
    cleanupInFlight = false
  }
}

export function startPlayIntentCleanupLoop() {
  if (cleanupLoopStarted) {
    return
  }

  cleanupLoopStarted = true
  void runCleanupSweep()

  const timer = setInterval(() => {
    void runCleanupSweep()
  }, playIntentCleanupIntervalMs)

  timer.unref()
}