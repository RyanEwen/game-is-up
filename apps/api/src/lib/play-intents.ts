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
  NotificationResponseChoice,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode as PrismaPlayIntentSelectionMode
} from '@prisma/client'
import { getMutualDiscoveryAudienceUserIds } from './discord-servers.js'
import { sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { toClientGameCoverUrl, toClientAvatarUrl } from './game-media.js'
import {
  buildPlayIntentDirectMessage,
  buildPlayIntentNotificationComponents,
  expirePendingPlayIntentNotifications
} from './play-intent-notification-responses.js'
import { prisma } from './prisma.js'
import { normalizeTimezoneId } from './timezone-label.js'

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

function formatScheduleDateTime(date: Date, timezoneId: string | null | undefined) {
  const normalizedTimezoneId = normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimezoneId,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}

function summarizeTitles(titles: string[]) {
  if (titles.length === 0) {
    return 'your games'
  }

  if (titles.length === 1) {
    return titles[0]
  }

  if (titles.length === 2) {
    return `${titles[0]} or ${titles[1]}`
  }

  return `${titles[0]} or ${titles.length - 1} other options`
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
  now: Date,
  recipientTimezoneId: string | null | undefined,
  updatedFields: string[] = []
) {
  const durationLabel = formatDurationLabel(durationMinutes)
  const isScheduled = startsAt.getTime() > now.getTime() + 60 * 1000
  const startsAtLabel = formatScheduleDateTime(startsAt, recipientTimezoneId)
  const updatedReason = updatedFields.length > 0
    ? `Update: ${updatedFields.join(', ')} changed.`
    : null

  if (selectionMode === 'library') {
    const title = isScheduled ? `${senderDisplayName} scheduled a call to play` : `${senderDisplayName} is looking to play`
    const body = isScheduled
      ? `${senderDisplayName} opened up their full library starting ${startsAtLabel} for ${durationLabel}.`
      : `${senderDisplayName} opened up their full library for the next ${durationLabel}.`

    return {
      title: updatedReason ? `Updated: ${title}` : title,
      body: updatedReason ? `${updatedReason} ${body}` : body
    }
  }

  const summarizedTitles = summarizeTitles(selectedTitles)
  const title = isScheduled
    ? `${senderDisplayName} scheduled ${summarizedTitles}`
    : `${senderDisplayName} wants to play ${summarizedTitles}`
  const body = isScheduled
    ? `${senderDisplayName} is planning ${summarizedTitles} starting ${startsAtLabel} for ${durationLabel}.`
    : `${senderDisplayName} is looking for ${summarizedTitles} in the next ${durationLabel}.`

  return {
    title: updatedReason ? `Updated: ${title}` : title,
    body: updatedReason ? `${updatedReason} ${body}` : body
  }
}

function normalizePlayIntentNote(note: string | null | undefined) {
  return note?.trim() ?? ''
}

function areSameStringSets(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)

  for (const value of right) {
    if (!leftSet.has(value)) {
      return false
    }
  }

  return true
}

function getUpdatedPlayIntentFields(options: {
  previousIntent: {
    selectionMode: PrismaPlayIntentSelectionMode;
    windowStartsAt: Date;
    windowEndsAt: Date;
    note: string;
    games: { gameId: string }[];
  };
  nextSelectionMode: PlayIntentSelectionMode;
  nextStartsAt: Date;
  nextEndsAt: Date;
  nextNote: string;
  nextSelectedGameIds: string[];
}) {
  const updatedFields: string[] = []

  if (
    options.previousIntent.windowStartsAt.getTime() !== options.nextStartsAt.getTime()
    || options.previousIntent.windowEndsAt.getTime() !== options.nextEndsAt.getTime()
  ) {
    updatedFields.push('time')
  }

  if (
    toClientSelectionMode(options.previousIntent.selectionMode) !== options.nextSelectionMode
    || !areSameStringSets(
      options.previousIntent.games.map((entry) => entry.gameId),
      options.nextSelectedGameIds
    )
  ) {
    updatedFields.push('game selection')
  }

  if (normalizePlayIntentNote(options.previousIntent.note) !== normalizePlayIntentNote(options.nextNote)) {
    updatedFields.push('note')
  }

  return updatedFields
}

function shouldRenotifyPriorDecliner(options: {
  updatedFields: string[];
  notifyScope: PlayIntentNotifyScope;
  targetedFriendUserIds: string[];
  recipientUserId: string;
}) {
  if (options.updatedFields.includes('time') || options.updatedFields.includes('game selection')) {
    return true
  }

  return options.notifyScope === 'specific-friends' && options.targetedFriendUserIds.includes(options.recipientUserId)
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
  voiceChannelId: string | null;
  voiceChannelName: string | null;
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
      .map((entry) => ({ ...entry.friendUser, avatarUrl: toClientAvatarUrl(entry.friendUser.avatarUrl) }))
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
    voiceChannelId: intent.voiceChannelId,
    voiceChannelName: intent.voiceChannelName,
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
  const now = new Date()
  const expiredIntentIds = (await prisma.playIntent.findMany({
    where: {
      userId,
      expiresAt: {
        lte: now
      },
      notifications: {
        some: {
          type: NotificationType.FRIEND_PLAYING,
          respondedAt: null
        }
      }
    },
    select: {
      id: true
    }
  })).map((intent) => intent.id)

  await expirePendingPlayIntentNotifications(expiredIntentIds)

  const activeIntent = await prisma.playIntent.findFirst({
    where: {
      userId,
      expiresAt: {
        gt: now
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
  const activeIntentIds = (await prisma.playIntent.findMany({
    where: {
      userId,
      expiresAt: {
        gt: now
      }
    },
    select: {
      id: true
    }
  })).map((intent) => intent.id)

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

  await expirePendingPlayIntentNotifications(activeIntentIds)
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
        displayName: true,
        timezoneId: true
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
  const dmGameEmbeds = payload.selectionMode === 'subset'
    ? selectedEntries
      .map((entry) => ({
        title: entry.game.title,
        coverUrl: toClientGameCoverUrl(entry.game.coverUrl)
      }))
      .filter((entry): entry is { title: string; coverUrl: string } => Boolean(entry.coverUrl))
      .slice(0, 3)
      .map((entry, index, allEntries) => ({
        title: allEntries.length > 1 ? `Possible game ${index + 1}: ${entry.title}` : `Possible game: ${entry.title}`,
        image: {
          url: entry.coverUrl
        }
      }))
    : []
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
  const supersededIntentIds = (await prisma.playIntent.findMany({
    where: {
      userId,
      expiresAt: {
        gt: now
      }
    },
    select: {
      id: true
    }
  })).map((intent) => intent.id)
  const { startsAt, durationMinutes, endsAt } = resolvePlayIntentWindow(payload, now)
  const headline = buildHeadline(payload.selectionMode, selectedTitles)
  const note = payload.note?.trim() ?? ''
  const [latestSupersededIntent, priorRecipientNotifications] = supersededIntentIds.length > 0
    ? await Promise.all([
      prisma.playIntent.findFirst({
        where: {
          id: {
            in: supersededIntentIds
          }
        },
        orderBy: [
          {
            expiresAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        select: {
          selectionMode: true,
          windowStartsAt: true,
          windowEndsAt: true,
          note: true,
          games: {
            select: {
              gameId: true
            }
          }
        }
      }),
      prisma.notification.findMany({
        where: {
          playIntentId: {
            in: supersededIntentIds
          },
          type: NotificationType.FRIEND_PLAYING
        },
        select: {
          userId: true,
          respondedAt: true,
          responseChoice: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        },
      })
    ])
    : [null, []]
  const priorRecipientStatusByUserId = new Map<string, {
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
  }>()
  for (const notification of priorRecipientNotifications) {
    if (!priorRecipientStatusByUserId.has(notification.userId)) {
      priorRecipientStatusByUserId.set(notification.userId, {
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice
      })
    }
  }
  const priorNotifiedRecipientUserIds = new Set(priorRecipientStatusByUserId.keys())
  const updatedFields = latestSupersededIntent
    ? getUpdatedPlayIntentFields({
      previousIntent: latestSupersededIntent,
      nextSelectionMode: payload.selectionMode,
      nextStartsAt: startsAt,
      nextEndsAt: endsAt,
      nextNote: note,
      nextSelectedGameIds: selectedGameIds
    })
    : []
  const isMeaningfulUpdate = updatedFields.length > 0 && priorNotifiedRecipientUserIds.size > 0
  const recipientUserIdsForNotifications = recipientUserIds.filter((recipientUserId) => {
    if (!isMeaningfulUpdate) {
      return true
    }

    const priorStatus = priorRecipientStatusByUserId.get(recipientUserId)

    if (!priorStatus || priorStatus.responseChoice !== NotificationResponseChoice.DECLINE) {
      return true
    }

    return shouldRenotifyPriorDecliner({
      updatedFields,
      notifyScope: payload.notifyScope,
      targetedFriendUserIds: targetedFriends.map((friend) => friend.id),
      recipientUserId
    })
  })
  const recipientProfiles = recipientUserIdsForNotifications.length > 0
    ? await prisma.user.findMany({
        where: {
          id: {
            in: recipientUserIdsForNotifications
          }
        },
        select: {
          id: true,
          timezoneId: true
        }
      })
    : []
  const recipientTimezoneByUserId = new Map(recipientProfiles.map((profile) => [profile.id, profile.timezoneId]))

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
        voiceChannelId: payload.voiceChannelId ?? null,
        voiceChannelName: payload.voiceChannelName ?? null,
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

    if (recipientUserIdsForNotifications.length > 0) {
      createdNotifications = await Promise.all(
        recipientUserIdsForNotifications.map((recipientUserId) => {
          const timezoneId = recipientTimezoneByUserId.get(recipientUserId) ?? sender.timezoneId
          const recipientUpdatedFields = isMeaningfulUpdate && priorNotifiedRecipientUserIds.has(recipientUserId)
            ? updatedFields
            : []
          const notificationCopy = buildNotificationCopy(
            sender.displayName,
            payload.selectionMode,
            selectedTitles,
            durationMinutes,
            startsAt,
            now,
            timezoneId,
            recipientUpdatedFields
          )

          return transaction.notification.create({
            data: {
              userId: recipientUserId,
              triggeredByUserId: userId,
              playIntentId: createdIntent.id,
              gameId: payload.selectionMode === 'subset' ? selectedGameIds[0] : null,
              type: NotificationType.FRIEND_PLAYING,
              title: notificationCopy.title,
              body: notificationCopy.body
            },
            select: {
              id: true,
              userId: true,
              title: true,
              body: true
            }
          })
        })
      )
    }

    activeIntent = serializeActivePlayIntent(createdIntent)
  })

  await expirePendingPlayIntentNotifications(supersededIntentIds)

  let deliveredNotificationCount = 0

  if (createdNotifications.length > 0) {
    const [recipientIdentities, creatorIdentity, creatorServerIds] = await Promise.all([
      prisma.userIdentity.findMany({
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
      }),
      prisma.userIdentity.findFirst({
        where: {
          provider: AuthProvider.DISCORD,
          userId
        },
        select: {
          providerUserId: true
        }
      }),
      payload.voiceChannelId
        ? prisma.discordServerMembership.findMany({
            where: { userId },
            select: { serverId: true }
          }).then((rows) => rows.map((row) => row.serverId))
        : Promise.resolve([] as string[])
    ])

    const recipientServerMemberships = payload.voiceChannelId && creatorServerIds.length > 0
      ? await prisma.discordServerMembership.findMany({
          where: {
            userId: { in: createdNotifications.map((n) => n.userId) },
            serverId: { in: creatorServerIds }
          },
          select: { userId: true }
        })
      : []
    const recipientUserIdsWithSharedServer = new Set(recipientServerMemberships.map((m) => m.userId))

    const creatorDiscordUserId = creatorIdentity?.providerUserId ?? null
    const discordUserIdByUserId = new Map(recipientIdentities.map((identity) => [identity.userId, identity.providerUserId]))
    type DirectMessageTarget = {
      notificationId: string;
      discordUserId: string;
      content: string;
      embeds: { title: string; image: { url: string } }[] | undefined;
    }
    const directMessageTargets = createdNotifications
      .map((notification) => {
        const discordUserId = discordUserIdByUserId.get(notification.userId)

        if (!discordUserId) {
          return null
        }

        const sharesServer = recipientUserIdsWithSharedServer.has(notification.userId)
        const voiceChannel = payload.voiceChannelId || payload.voiceChannelName
          ? {
              channelId: payload.voiceChannelId ?? null,
              channelName: payload.voiceChannelName ?? null,
              recipientSharesServer: sharesServer
            }
          : null

        return {
          notificationId: notification.id,
          discordUserId,
          content: buildPlayIntentDirectMessage(notification.title, notification.body, creatorDiscordUserId, voiceChannel),
          embeds: dmGameEmbeds.length > 0
            ? dmGameEmbeds
            : undefined
        }
      })
          .filter((target): target is DirectMessageTarget => target != null)

    if (directMessageTargets.length > 0) {
      const dmResults = await sendDiscordDirectMessages(
        directMessageTargets.map((target) => ({
          discordUserId: target.discordUserId,
          content: target.content,
          embeds: target.embeds,
          components: buildPlayIntentNotificationComponents(target.notificationId, userId)
        }))
      )
      const deliveredTargets = directMessageTargets
        .map((target) => {
          const result = dmResults.find((candidate) => candidate.discordUserId === target.discordUserId && candidate.status === 'sent')

          return result
            ? {
                notificationId: target.notificationId,
                channelId: result.channelId,
                messageId: result.messageId
              }
            : null
        })
        .filter((target): target is { notificationId: string; channelId: string | null; messageId: string | null } => target != null)

      deliveredNotificationCount = deliveredTargets.length

      await Promise.all(deliveredTargets.map((target) => prisma.notification.update({
        where: {
          id: target.notificationId
        },
        data: {
          deliveredAt: new Date(),
          discordDmChannelId: target.channelId,
          discordDmMessageId: target.messageId
        }
      })))
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
