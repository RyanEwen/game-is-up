import { NotificationResponseChoice, NotificationType } from '@prisma/client'
import { toClientAvatarUrl } from './game-media.js'
import { prisma } from './prisma.js'

type InterestedPlayIntentUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

const joinResponseNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as NotificationType[]

export async function getInterestedUsersByPlayIntentId(playIntentIds: string[]) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  if (uniquePlayIntentIds.length === 0) {
    return new Map<string, InterestedPlayIntentUser[]>()
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: uniquePlayIntentIds
      },
      responseChoice: NotificationResponseChoice.JOIN,
      type: {
        in: joinResponseNotificationTypes
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

  const interestedUsersByPlayIntentId = new Map<string, InterestedPlayIntentUser[]>()
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

    const interestedUsers = interestedUsersByPlayIntentId.get(notification.playIntentId) ?? []
    interestedUsers.push({
      id: notification.user.id,
      handle: notification.user.handle,
      displayName: notification.user.displayName,
      avatarUrl: toClientAvatarUrl(notification.user.avatarUrl)
    })
    interestedUsersByPlayIntentId.set(notification.playIntentId, interestedUsers)
  }

  for (const interestedUsers of interestedUsersByPlayIntentId.values()) {
    interestedUsers.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  return interestedUsersByPlayIntentId
}