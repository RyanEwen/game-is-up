import type {
  ActivePlayIntent,
  PlayIntentNotifyScope,
  PlayIntentSelectionMode,
  UpsertPlayIntentRequest,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import {
  AuthProvider,
  GameIntentType,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode as PrismaPlayIntentSelectionMode
} from '@prisma/client'
import { getMutualDiscoveryAudienceUserIds } from './discord-servers.js'
import { sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { toClientGameCoverUrl } from './game-media.js'
import {
  buildPlayIntentDirectMessage,
  buildPlayIntentNotificationComponents
} from './play-intent-notification-responses.js'
import { prisma } from './prisma.js'

export class PlayIntentValidationError extends Error {}

const minimumPlayIntentDurationMinutes = 15
const maximumPlayIntentDurationMinutes = 24 * 60

const activePlayIntentInclude = {
  games: {
    include: {
      game: true
    }
  },
  platforms: true,
  targetFriends: {
    include: {
      friendUser: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          avatarUrl: true
        }
      }
    }
  }
} as const

function toClientSelectionMode(selectionMode: PrismaPlayIntentSelectionMode): PlayIntentSelectionMode {
  return selectionMode === PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toPrismaSelectionMode(selectionMode: PlayIntentSelectionMode): PrismaPlayIntentSelectionMode {
  return selectionMode === 'library'
    ? PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY
    : PrismaPlayIntentSelectionMode.SELECTED_GAMES
}

function toClientNotifyScope(scope: PlayIntentScope): PlayIntentNotifyScope {
  switch (scope) {
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return 'specific-friends'
    case PlayIntentScope.MUTUAL_FRIENDS:
      return 'network'
    default:
      return 'friends-only'
  }
}

function toPrismaNotifyScope(scope: PlayIntentNotifyScope): PlayIntentScope {
  switch (scope) {
    case 'specific-friends':
      return PlayIntentScope.SPECIFIC_FRIENDS
    case 'network':
      return PlayIntentScope.MUTUAL_FRIENDS
    default:
      return PlayIntentScope.FRIENDS_ONLY
  }
}

function formatDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} minutes`
}

function formatScheduleDateTime(date: Date) {
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function summarizeTitles(titles: string[]) {
  if (titles.length === 0) {
    return 'your games'
  }

  if (titles.length === 1) {
    return titles[0]
  }

  if (titles.length === 2) {
    return `${titles[0]} and ${titles[1]}`
  }

  return `${titles[0]} and ${titles.length - 1} more`
}

function buildHeadline(selectionMode: PlayIntentSelectionMode, selectedTitles: string[]) {
  return selectionMode === 'library'
    ? 'Open to anything in my library right now'
    : `Looking to play ${summarizeTitles(selectedTitles)}`
}

function buildNotificationCopy(
  senderDisplayName: string,
  selectionMode: PlayIntentSelectionMode,
  selectedTitles: string[],
  durationMinutes: number,
  startsAt: Date,
  now: Date
) {
  const durationLabel = formatDurationLabel(durationMinutes)
  const isScheduled = startsAt.getTime() > now.getTime() + 60 * 1000
  const startsAtLabel = formatScheduleDateTime(startsAt)

  if (selectionMode === 'library') {
    return {
      title: isScheduled ? `${senderDisplayName} scheduled a play session` : `${senderDisplayName} is looking to play`,
      body: isScheduled
        ? `${senderDisplayName} opened up their full library starting ${startsAtLabel} for ${durationLabel}.`
        : `${senderDisplayName} opened up their full library for the next ${durationLabel}.`
    }
  }

  const summarizedTitles = summarizeTitles(selectedTitles)
  return {
    title: isScheduled
      ? `${senderDisplayName} scheduled ${summarizedTitles}`
      : `${senderDisplayName} wants to play ${summarizedTitles}`,
    body: isScheduled
      ? `${senderDisplayName} is planning ${summarizedTitles} starting ${startsAtLabel} for ${durationLabel}.`
      : `${senderDisplayName} is looking for ${summarizedTitles} in the next ${durationLabel}.`
  }
}

function dedupePlatformLabels(platformLabels: string[]) {
  return [...new Set(platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

function resolvePlayIntentWindow(payload: UpsertPlayIntentRequest, now: Date) {
  const startsAt = payload.startAt ? new Date(payload.startAt) : now

  if (Number.isNaN(startsAt.getTime())) {
    throw new PlayIntentValidationError('Choose a valid start time for your play session.')
  }

  if (payload.startAt && startsAt.getTime() <= now.getTime()) {
    throw new PlayIntentValidationError('Choose a future start time or post your call to play now.')
  }

  if (payload.endAt) {
    const endsAt = new Date(payload.endAt)

    if (Number.isNaN(endsAt.getTime())) {
      throw new PlayIntentValidationError('Choose a valid end time for your call to play.')
    }

    const durationMinutes = Math.ceil((endsAt.getTime() - startsAt.getTime()) / (60 * 1000))

    if (durationMinutes < minimumPlayIntentDurationMinutes) {
      throw new PlayIntentValidationError(`Choose an end time at least ${minimumPlayIntentDurationMinutes} minutes after the session starts.`)
    }

    if (durationMinutes > maximumPlayIntentDurationMinutes) {
      throw new PlayIntentValidationError('Calls to play can stay live for up to 24 hours.')
    }

    return {
      startsAt,
      durationMinutes,
      endsAt
    }
  }

  const durationMinutes = payload.durationMinutes ?? minimumPlayIntentDurationMinutes

  if (durationMinutes < minimumPlayIntentDurationMinutes) {
    throw new PlayIntentValidationError(`Calls to play must stay live for at least ${minimumPlayIntentDurationMinutes} minutes.`)
  }

  if (durationMinutes > maximumPlayIntentDurationMinutes) {
    throw new PlayIntentValidationError('Calls to play can stay live for up to 24 hours.')
  }

  return {
    startsAt,
    durationMinutes,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60 * 1000)
  }
}

function serializeActivePlayIntent(intent: {
  id: string;
  headline: string;
  note: string;
  selectionMode: PrismaPlayIntentSelectionMode;
  scope: PlayIntentScope;
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  platforms: { platformLabel: string }[];
  games: { game: { id: string; title: string; coverUrl: string | null } }[];
  targetFriends: { friendUser: { id: string; handle: string; displayName: string; avatarUrl: string | null } }[];
}): ActivePlayIntent {
  const primaryPlatform = intent.platforms[0]?.platformLabel ?? 'Unknown'

  return {
    id: intent.id,
    title: intent.headline,
    selectionMode: toClientSelectionMode(intent.selectionMode),
    notifyScope: toClientNotifyScope(intent.scope),
    targetedFriends: intent.targetFriends
      .map((entry) => entry.friendUser)
      .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    platforms: intent.platforms.map((platform) => platform.platformLabel).sort((left, right) => left.localeCompare(right)),
    games: intent.games
      .map((entry) => ({
        id: entry.game.id,
        title: entry.game.title,
        platform: primaryPlatform,
        coverUrl: toClientGameCoverUrl(entry.game.coverUrl)
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
    note: intent.note,
    windowStartsAt: intent.windowStartsAt.toISOString(),
    windowEndsAt: intent.windowEndsAt.toISOString(),
    expiresAt: intent.expiresAt.toISOString()
  }
}

async function getRecipientUserIds(
  userId: string,
  scope: PlayIntentNotifyScope,
  overlappingGameIds: string[],
  explicitFriendUserIds: string[],
  targetUserIds: string[]
) {
  if (overlappingGameIds.length === 0) {
    return []
  }

  const recipientUserIds = scope === 'network'
    ? [...new Set([...explicitFriendUserIds, ...(await getMutualDiscoveryAudienceUserIds(userId))])]
    : scope === 'specific-friends'
      ? targetUserIds
      : explicitFriendUserIds

  if (recipientUserIds.length === 0) {
    return []
  }

  const overlappingRecipients = await prisma.userGameInterest.findMany({
    where: {
      userId: {
        in: recipientUserIds
      },
      gameId: {
        in: overlappingGameIds
      },
      intentType: {
        not: GameIntentType.COMPLETED
      }
    },
    distinct: ['userId'],
    select: {
      userId: true
    }
  })

  const overlappingRecipientUserIds = overlappingRecipients.map((entry) => entry.userId)

  if (overlappingRecipientUserIds.length === 0) {
    return []
  }

  const activeRecipientIntents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: overlappingRecipientUserIds
      },
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      userId: true,
      selectionMode: true,
      games: {
        select: {
          gameId: true
        }
      }
    }
  })

  const overlappingGameIdSet = new Set(overlappingGameIds)
  const excludedUserIds = new Set(
    activeRecipientIntents
      .filter((intent) => intent.selectionMode === PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY
        || intent.games.some((game) => overlappingGameIdSet.has(game.gameId)))
      .map((intent) => intent.userId)
  )

  return overlappingRecipientUserIds.filter((recipientUserId) => !excludedUserIds.has(recipientUserId))
}

export async function getPlayIntentRecipientUserIds(
  userId: string,
  scope: PlayIntentNotifyScope,
  overlappingGameIds: string[],
  targetUserIds: string[] = []
) {
  const explicitFriendUserIds = (await prisma.friend.findMany({
    where: {
      userId
    },
    select: {
      friendedUserId: true
    }
  })).map((friend) => friend.friendedUserId)

  return getRecipientUserIds(userId, scope, overlappingGameIds, explicitFriendUserIds, targetUserIds)
}

async function getPlayableLibraryEntries(userId: string) {
  return prisma.userGameInterest.findMany({
    where: {
      userId,
      intentType: {
        not: GameIntentType.COMPLETED
      }
    },
    include: {
      game: true,
      platforms: {
        orderBy: {
          platformLabel: 'asc'
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  })
}

export async function getCurrentPlayIntent(userId: string) {
  const activeIntent = await prisma.playIntent.findFirst({
    where: {
      userId,
      expiresAt: {
        gt: new Date()
      }
    },
    include: activePlayIntentInclude,
    orderBy: [
      {
        expiresAt: 'desc'
      },
      {
        createdAt: 'desc'
      }
    ]
  })

  return activeIntent ? serializeActivePlayIntent(activeIntent) : null
}

export async function clearCurrentPlayIntent(userId: string) {
  const now = new Date()

  await prisma.playIntent.updateMany({
    where: {
      userId,
      expiresAt: {
        gt: now
      }
    },
    data: {
      expiresAt: now,
      windowEndsAt: now
    }
  })
}

export async function upsertCurrentPlayIntent(
  userId: string,
  payload: UpsertPlayIntentRequest
): Promise<UpsertPlayIntentResponse> {
  const [sender, outgoingFriends, libraryEntries] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        displayName: true
      }
    }),
    prisma.friend.findMany({
      where: {
        userId
      },
      select: {
        friendedUser: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    }),
    getPlayableLibraryEntries(userId)
  ])

  if (!sender) {
    throw new PlayIntentValidationError('User not found.')
  }

  if (libraryEntries.length === 0) {
    throw new PlayIntentValidationError('Add at least one game to your library before posting a call to play.')
  }

  const selectedEntries = payload.selectionMode === 'library'
    ? libraryEntries
    : libraryEntries.filter((entry) => payload.gameIds.includes(entry.gameId))

  selectedEntries.sort((left, right) => left.game.title.localeCompare(right.game.title))

  if (payload.selectionMode === 'subset' && payload.gameIds.length === 0) {
    throw new PlayIntentValidationError('Pick at least one game before posting a selected-games call to play.')
  }

  if (selectedEntries.length === 0) {
    throw new PlayIntentValidationError('Your selected games need to come from your current library.')
  }

  const selectedGameIds = selectedEntries.map((entry) => entry.gameId)
  const selectedTitles = selectedEntries.map((entry) => entry.game.title)
  const platformLabels = dedupePlatformLabels(
    selectedEntries.flatMap((entry) => entry.platforms.map((platform) => platform.platformLabel))
  )
  const explicitFriendUsers = outgoingFriends.map((friend) => friend.friendedUser)
  const explicitFriendUserIds = explicitFriendUsers.map((friend) => friend.id)
  const normalizedTargetUserIds = [...new Set(payload.targetUserIds)]
  const targetedFriends = payload.notifyScope === 'specific-friends'
    ? normalizedTargetUserIds.map((targetUserId) => {
        const matchedFriend = explicitFriendUsers.find((friend) => friend.id === targetUserId)

        if (!matchedFriend) {
          throw new PlayIntentValidationError('Only people you already added as friends can be chosen for a specific-friends call to play.')
        }

        return matchedFriend
      })
    : []

  if (platformLabels.length === 0) {
    throw new PlayIntentValidationError('Choose at least one platform in your library before posting a call to play.')
  }

  if (payload.notifyScope === 'specific-friends' && targetedFriends.length === 0) {
    throw new PlayIntentValidationError('Choose at least one friend for a specific-friends call to play.')
  }

  const recipientUserIds = await getRecipientUserIds(
    userId,
    payload.notifyScope,
    selectedGameIds,
    explicitFriendUserIds,
    targetedFriends.map((friend) => friend.id)
  )
  const now = new Date()
  const { startsAt, durationMinutes, endsAt } = resolvePlayIntentWindow(payload, now)
  const headline = buildHeadline(payload.selectionMode, selectedTitles)
  const { title, body } = buildNotificationCopy(sender.displayName, payload.selectionMode, selectedTitles, durationMinutes, startsAt, now)
  const note = payload.note?.trim() ?? ''

  let activeIntent: ActivePlayIntent | null = null
  let createdNotifications: Array<{ id: string; userId: string; title: string; body: string }> = []

  await prisma.$transaction(async (transaction) => {
    await transaction.playIntent.updateMany({
      where: {
        userId,
        expiresAt: {
          gt: now
        }
      },
      data: {
        expiresAt: now,
        windowEndsAt: now
      }
    })

    const createdIntent = await transaction.playIntent.create({
      data: {
        userId,
        selectionMode: toPrismaSelectionMode(payload.selectionMode),
        headline,
        note,
        scope: toPrismaNotifyScope(payload.notifyScope),
        windowStartsAt: startsAt,
        windowEndsAt: endsAt,
        expiresAt: endsAt,
        platforms: {
          create: platformLabels.map((platformLabel) => ({
            platformLabel
          }))
        },
        targetFriends: payload.notifyScope === 'specific-friends'
          ? {
              create: targetedFriends.map((friend) => ({
                friendUserId: friend.id
              }))
            }
          : undefined,
        games: payload.selectionMode === 'library'
          ? undefined
          : {
              create: selectedGameIds.map((gameId) => ({
                gameId
              }))
            }
      },
      include: activePlayIntentInclude
    })

    if (recipientUserIds.length > 0) {
      createdNotifications = await Promise.all(
        recipientUserIds.map((recipientUserId) => transaction.notification.create({
          data: {
            userId: recipientUserId,
            triggeredByUserId: userId,
            playIntentId: createdIntent.id,
            gameId: payload.selectionMode === 'subset' ? selectedGameIds[0] : null,
            type: NotificationType.FRIEND_PLAYING,
            title,
            body
          },
          select: {
            id: true,
            userId: true,
            title: true,
            body: true
          }
        }))
      )
    }

    activeIntent = serializeActivePlayIntent(createdIntent)
  })

  let deliveredNotificationCount = 0

  if (createdNotifications.length > 0) {
    const recipientIdentities = await prisma.userIdentity.findMany({
      where: {
        provider: AuthProvider.DISCORD,
        userId: {
          in: createdNotifications.map((notification) => notification.userId)
        }
      },
      select: {
        userId: true,
        providerUserId: true
      }
    })
    const discordUserIdByUserId = new Map(recipientIdentities.map((identity) => [identity.userId, identity.providerUserId]))
    const directMessageTargets = createdNotifications
      .map((notification) => {
        const discordUserId = discordUserIdByUserId.get(notification.userId)

        if (!discordUserId) {
          return null
        }

        return {
          notificationId: notification.id,
          discordUserId,
          content: buildPlayIntentDirectMessage(notification.title, notification.body)
        }
      })
      .filter((target): target is { notificationId: string; discordUserId: string; content: string } => target != null)

    if (directMessageTargets.length > 0) {
      const dmResults = await sendDiscordDirectMessages(
        directMessageTargets.map((target) => ({
          discordUserId: target.discordUserId,
          content: target.content,
          components: buildPlayIntentNotificationComponents(target.notificationId)
        }))
      )
      const deliveredNotificationIds = directMessageTargets
        .filter((target) => dmResults.some((result) => result.discordUserId === target.discordUserId && result.status === 'sent'))
        .map((target) => target.notificationId)

      deliveredNotificationCount = deliveredNotificationIds.length

      if (deliveredNotificationIds.length > 0) {
        await prisma.notification.updateMany({
          where: {
            id: {
              in: deliveredNotificationIds
            }
          },
          data: {
            deliveredAt: new Date()
          }
        })
      }
    }
  }

  if (!activeIntent) {
    throw new PlayIntentValidationError('Unable to save your call to play right now.')
  }

  return {
    activeIntent,
    notifiedFriendCount: deliveredNotificationCount
  }
}
