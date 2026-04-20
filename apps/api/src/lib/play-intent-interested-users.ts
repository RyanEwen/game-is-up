import { NotificationResponseChoice, NotificationType } from '@prisma/client'
import { toClientAvatarUrl } from './game-media.js'
import { prisma } from './prisma.js'

export type PlayIntentResponseUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

const recipientResponseNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as NotificationType[]

async function getResponseUsersByPlayIntentId(playIntentIds: string[], responseChoice: NotificationResponseChoice) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  if (uniquePlayIntentIds.length === 0) {
    return new Map<string, PlayIntentResponseUser[]>()
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: uniquePlayIntentIds
      },
      responseChoice,
      type: {
        in: recipientResponseNotificationTypes
      }
    },
    select: {
      playIntentId: true,
      user: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  const responseUsersByPlayIntentId = new Map<string, PlayIntentResponseUser[]>()
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
      avatarUrl: toClientAvatarUrl(notification.user.avatarUrl)
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

export async function getPassedUsersByPlayIntentId(playIntentIds: string[]) {
  return getResponseUsersByPlayIntentId(playIntentIds, NotificationResponseChoice.DECLINE)
}