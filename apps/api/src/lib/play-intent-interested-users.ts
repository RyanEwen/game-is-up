import { AuthProvider, NotificationResponseChoice, NotificationType } from '@prisma/client'
import { toClientAvatarUrl } from './game-media.js'
import { prisma } from './prisma.js'

export type PlayIntentResponseUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** True when this interested user flagged that they will be late. */
  runningLate: boolean;
  identities?: { providerUserId: string }[];
}

type PlayIntentRecipientResponseUser = PlayIntentResponseUser & {
  /** Latest recipient-notification response; null when still unanswered. */
  responseChoice: NotificationResponseChoice | null;
}

const recipientResponseNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as NotificationType[]

const autoPromptInterestLeadMinutes = 10

/**
 * Returns true when a user is already committed to a call to play that is live
 * now or will start within the prompt suppression lead window.
 */
export function isInterestedPlayIntentWindowBlockingAutoPrompt(
  windowStartsAt: Date,
  windowEndsAt: Date,
  referenceTime: Date,
  leadMinutes = autoPromptInterestLeadMinutes
) {
  return windowEndsAt > referenceTime
    && windowStartsAt <= new Date(referenceTime.getTime() + leadMinutes * 60 * 1000)
}

async function getResponseUsersByPlayIntentId(playIntentIds: string[], responseChoice?: NotificationResponseChoice) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  if (uniquePlayIntentIds.length === 0) {
    return new Map<string, PlayIntentRecipientResponseUser[]>()
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: uniquePlayIntentIds
      },
      ...(responseChoice ? { responseChoice } : {}),
      type: {
        in: recipientResponseNotificationTypes
      }
    },
    select: {
      playIntentId: true,
      responseChoice: true,
      runningLateAt: true,
      user: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          avatarUrl: true,
          identities: {
            where: {
              provider: AuthProvider.DISCORD
            },
            select: {
              providerUserId: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const responseUsersByPlayIntentId = new Map<string, PlayIntentRecipientResponseUser[]>()
  const seenKeys = new Set<string>()

  for (const notification of notifications) {
    if (!notification.playIntentId) {
      continue
    }

    const dedupeKey = `${notification.playIntentId}:${notification.user.id}`

    if (seenKeys.has(dedupeKey)) {
      continue
    }

    seenKeys.add(dedupeKey)

    const responseUsers = responseUsersByPlayIntentId.get(notification.playIntentId) ?? []
    responseUsers.push({
      id: notification.user.id,
      handle: notification.user.handle,
      displayName: notification.user.displayName,
      avatarUrl: toClientAvatarUrl(notification.user.avatarUrl),
      runningLate: notification.runningLateAt != null,
      responseChoice: notification.responseChoice,
      identities: notification.user.identities
    })
    responseUsersByPlayIntentId.set(notification.playIntentId, responseUsers)
  }

  for (const responseUsers of responseUsersByPlayIntentId.values()) {
    responseUsers.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  return responseUsersByPlayIntentId
}

export async function getInterestedUsersByPlayIntentId(playIntentIds: string[]) {
  return getResponseUsersByPlayIntentId(playIntentIds, NotificationResponseChoice.JOIN)
}

/**
 * All invited recipients still eligible for SYSTEM update fan-out: their
 * latest recipient notification is either unanswered or an interested (JOIN)
 * response. Recipients whose latest response is a pass (or an expired prompt)
 * are excluded so passing stops the update pings.
 */
export async function getUpdateEligibleRecipientsByPlayIntentId(playIntentIds: string[]) {
  const recipientsByPlayIntentId = await getResponseUsersByPlayIntentId(playIntentIds)
  const eligibleRecipientsByPlayIntentId = new Map<string, PlayIntentResponseUser[]>()

  for (const [playIntentId, recipients] of recipientsByPlayIntentId) {
    eligibleRecipientsByPlayIntentId.set(
      playIntentId,
      recipients.filter((recipient) => (
        recipient.responseChoice === null || recipient.responseChoice === NotificationResponseChoice.JOIN
      ))
    )
  }

  return eligibleRecipientsByPlayIntentId
}

/**
 * Returns whether the user already answered "I'm interested" on a recipient
 * notification for a call to play that is active now or starts soon.
 */
export async function hasInterestedPlayIntentBlockingAutoPrompt(
  userId: string,
  referenceTime: Date,
  leadMinutes = autoPromptInterestLeadMinutes
) {
  const latestAllowedStartAt = new Date(referenceTime.getTime() + leadMinutes * 60 * 1000)

  const notification = await prisma.notification.findFirst({
    where: {
      userId,
      responseChoice: NotificationResponseChoice.JOIN,
      type: {
        in: recipientResponseNotificationTypes
      },
      playIntent: {
        windowEndsAt: {
          gt: referenceTime
        },
        windowStartsAt: {
          lte: latestAllowedStartAt
        }
      }
    },
    select: {
      id: true
    }
  })

  return notification != null
}

export async function getPassedUsersByPlayIntentId(playIntentIds: string[]) {
  return getResponseUsersByPlayIntentId(playIntentIds, NotificationResponseChoice.DECLINE)
}