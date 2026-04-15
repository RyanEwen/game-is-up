import { NotificationType } from '@prisma/client'
import {
  expirePendingPlayIntentNotifications,
  sweepScheduledPlayIntentCreatorCheckIns
} from './play-intent-notification-responses.js'
import { prisma } from './prisma.js'

const playIntentCleanupIntervalMs = 60 * 1000

let cleanupLoopStarted = false
let cleanupInFlight = false

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
    await sweepScheduledPlayIntentCreatorCheckIns()
    await sweepExpiredPlayIntentNotifications()
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