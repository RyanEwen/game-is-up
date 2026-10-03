import { sweepOldDiscordDirectMessages } from './discord-dm-cleanup.js'
import { refreshTrackedDiscordAutoPlayPromptDirectMessages } from './discord-auto-play-prompts.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import {
  expirePendingPlayIntentNotifications,
  refreshTrackedCreatorPlayIntentSummaryMessages,
  refreshTrackedPlayIntentNotificationDirectMessages,
  sweepScheduledPlayIntentCreatorCheckIns
} from './play-intent-notification-responses.js'
import {
  sweepBackfillLegacyPlayIntentDiscordSpaces,
  sweepBackfillMissingPlayIntentDiscordSpaceDeleteAfter,
  sweepDeleteDuePlayIntentDiscordSpaces,
  sweepProvisionPendingPlayIntentDiscordSpaces
} from './play-intent-discord-spaces.js'
import { sweepUpgradePlayIntentDiscordSpaceInvites } from './discord-space-invites.js'
import { prisma } from './prisma.js'

const playIntentCleanupIntervalMs = 60 * 1000
const staleDiscordDmSweepIntervalMs = 60 * 60 * 1000
const playIntentArchiveSweepIntentCap = 200

let cleanupLoopStarted = false
let cleanupInFlight = false
let lastStaleDiscordDmSweepStartedAt = 0
let trackedDiscordDmRefreshCompleted = false
let lastPlayIntentTimeBoundarySweepCompletedAt = Date.now()

async function publishElapsedPlayIntentTimeBoundaryInvalidation() {
  const sweepStartedAt = Date.now()
  const priorSweepCompletedAt = lastPlayIntentTimeBoundarySweepCompletedAt

  const elapsedBoundaryCount = await prisma.playIntent.count({
    where: {
      OR: [
        {
          windowStartsAt: {
            gt: new Date(priorSweepCompletedAt),
            lte: new Date(sweepStartedAt)
          }
        },
        {
          expiresAt: {
            gt: new Date(priorSweepCompletedAt),
            lte: new Date(sweepStartedAt)
          }
        }
      ]
    }
  })

  lastPlayIntentTimeBoundarySweepCompletedAt = sweepStartedAt

  if (elapsedBoundaryCount > 0) {
    publishPlayIntentInvalidation()
  }
}

/**
 * Archives every expired play intent whose DM chain has not been ended yet.
 *
 * Selection keys off `dmChainEndedAt IS NULL` rather than unresponded
 * notifications, so fully-responded calls to play are archived too. Archiving
 * sets the marker, so each chain is processed exactly once and a backlog drains
 * across successive sweeps (capped per pass) without regrowing.
 */
export async function sweepExpiredPlayIntentNotifications() {
  const expiredIntentIds = (await prisma.playIntent.findMany({
    where: {
      expiresAt: {
        lte: new Date()
      },
      dmChainEndedAt: null
    },
    orderBy: {
      expiresAt: 'asc'
    },
    take: playIntentArchiveSweepIntentCap,
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
    await sweepProvisionPendingPlayIntentDiscordSpaces()
    await sweepBackfillLegacyPlayIntentDiscordSpaces()
    await sweepUpgradePlayIntentDiscordSpaceInvites()
    await sweepBackfillMissingPlayIntentDiscordSpaceDeleteAfter()
    await sweepDeleteDuePlayIntentDiscordSpaces()

    if (!trackedDiscordDmRefreshCompleted) {
      await refreshTrackedPlayIntentNotificationDirectMessages()
      await refreshTrackedDiscordAutoPlayPromptDirectMessages()
      await refreshTrackedCreatorPlayIntentSummaryMessages()
      trackedDiscordDmRefreshCompleted = true
    }

    await sweepExpiredPlayIntentNotifications()
    await publishElapsedPlayIntentTimeBoundaryInvalidation()

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