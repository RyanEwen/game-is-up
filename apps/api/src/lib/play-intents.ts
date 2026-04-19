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
  Prisma,
  PlayIntentDiscordSpaceStatus,
  PlayIntentDiscordSpaceAccessSource,
  PlayIntentScope,
  PlayIntentSelectionMode as PrismaPlayIntentSelectionMode
} from '@prisma/client'
import { env } from './env.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import {
  buildDiscordServerIconUrl,
  getSelectedDiscordServerIds,
  getMutualDiscoveryAudienceUserIds,
  getTargetDiscordServersAudienceUserIds
} from './discord-servers.js'
import { sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { toClientGameCoverUrl, toClientAvatarUrl } from './game-media.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import {
  buildPlayIntentDirectMessageHeading,
  buildPlayIntentDirectMessageEmbeds,
  buildPlayIntentNotificationComponents,
  expirePendingPlayIntentNotifications,
  syncCreatorPlayIntentSummaryMessages
} from './play-intent-notification-responses.js'
import {
  getPlayIntentDiscordSpaceRecipientContexts,
  provisionPlayIntentDiscordSpaceByPlayIntentId,
  type PlayIntentDiscordSpaceRecipientContext
} from './play-intent-discord-spaces.js'
import { prisma } from './prisma.js'
import { formatPlayIntentDurationLabel, formatPlayIntentWindowLabel } from './play-intent-time-format.js'

export class PlayIntentValidationError extends Error {}

const minimumPlayIntentDurationMinutes = 15
const maximumPlayIntentDurationMinutes = 24 * 60

const activePlayIntentInclude = Prisma.validator<Prisma.PlayIntentInclude>()({
  games: {
    include: {
      game: true
    }
  },
  platforms: true,
  targetDiscordServers: {
    include: {
      server: {
        select: {
          id: true,
          name: true,
          iconHash: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  },
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
  },
  discordSpace: {
    select: {
      serverId: true,
      status: true,
      roleName: true,
      categoryChannelName: true,
      textChannelName: true,
      voiceChannelName: true,
      deleteAfter: true
    }
  },
  _count: {
    select: {
      notifications: {
        where: {
          responseChoice: NotificationResponseChoice.JOIN,
          type: {
            in: [
              NotificationType.FRIEND_PLAYING,
              NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
              NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
            ] as NotificationType[]
          }
        }
      }
    }
  }
})

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
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return 'specific-discord-server'
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
    case 'specific-discord-server':
      return PlayIntentScope.SPECIFIC_DISCORD_SERVER
    case 'specific-friends':
      return PlayIntentScope.SPECIFIC_FRIENDS
    case 'network':
      return PlayIntentScope.MUTUAL_FRIENDS
    default:
      return PlayIntentScope.FRIENDS_ONLY
  }
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

  return 'one of the following games'
}

const defaultPlayIntentTitle = 'Call to play'

function normalizePlayIntentTitle(title: string | null | undefined) {
  const normalizedTitle = title?.trim() ?? ''

  return normalizedTitle.length > 0 ? normalizedTitle : defaultPlayIntentTitle
}

export function buildPlayIntentNotificationCopy(
  senderDisplayName: string,
  selectionMode: PlayIntentSelectionMode,
  selectedTitles: string[],
  durationMinutes: number,
  startsAt: Date,
  now: Date,
  recipientTimezoneId: string | null | undefined,
  updatedFields: string[] = []
) {
  const isScheduled = startsAt.getTime() > now.getTime() + 60 * 1000
  const windowLabel = formatPlayIntentWindowLabel(
    startsAt,
    new Date(startsAt.getTime() + durationMinutes * 60 * 1000),
    recipientTimezoneId
  )
  const updatedReason = updatedFields.length > 0
    ? `Update: ${updatedFields.join(', ')} changed.`
    : null
  const timingLine = isScheduled
    ? `When: ${windowLabel}.`
    : `When: In the next ${formatPlayIntentDurationLabel(durationMinutes)}.`

  if (selectionMode === 'library') {
    const title = isScheduled ? `${senderDisplayName} scheduled a call to play` : `${senderDisplayName} is looking to play`
    const body = [
      updatedReason,
      'Games: Any game in their library.',
      timingLine
    ].filter((line): line is string => Boolean(line)).join('\n')

    return {
      title: updatedReason ? `Updated: ${title}` : title,
      body
    }
  }

  const summarizedTitles = summarizeTitles(selectedTitles)
  const title = isScheduled
    ? `${senderDisplayName} scheduled ${summarizedTitles}`
    : `${senderDisplayName} wants to play ${summarizedTitles}`
  const body = [updatedReason, timingLine].filter((line): line is string => Boolean(line)).join('\n')

  return {
    title: updatedReason ? `Updated: ${title}` : title,
    body
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
    discordSpace: { id: string } | null;
    games: { gameId: string }[];
  };
  nextSelectionMode: PlayIntentSelectionMode;
  nextStartsAt: Date;
  nextEndsAt: Date;
  nextNote: string;
  nextCreateDiscordSpace: boolean;
  nextSelectedGameIds: string[];
}) {
  const updatedFields: string[] = []
  const previousSelectionMode = toClientSelectionMode(options.previousIntent.selectionMode)

  if (
    options.previousIntent.windowStartsAt.getTime() !== options.nextStartsAt.getTime()
    || options.previousIntent.windowEndsAt.getTime() !== options.nextEndsAt.getTime()
  ) {
    updatedFields.push('time')
  }

  if (
    previousSelectionMode !== options.nextSelectionMode
    || (
      previousSelectionMode === 'subset'
      && options.nextSelectionMode === 'subset'
      && !areSameStringSets(
        options.previousIntent.games.map((entry) => entry.gameId),
        options.nextSelectedGameIds
      )
    )
  ) {
    updatedFields.push('game selection')
  }

  if (normalizePlayIntentNote(options.previousIntent.note) !== normalizePlayIntentNote(options.nextNote)) {
    updatedFields.push('note')
  }

  if (Boolean(options.previousIntent.discordSpace) !== options.nextCreateDiscordSpace) {
    updatedFields.push('temporary Discord channel')
  }

  return updatedFields
}

function shouldRenotifyPriorDecliner(options: {
  updatedFields: string[];
  notifyScope: PlayIntentNotifyScope;
  targetedFriendUserIds: string[];
  recipientUserId: string;
}) {
  if (options.updatedFields.includes('time') || options.updatedFields.includes('game selection') || options.updatedFields.includes('temporary Discord channel')) {
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

function serializeTargetDiscordServer(targetDiscordServer: { id: string; name: string; iconHash: string | null } | null) {
  if (!targetDiscordServer) {
    return null
  }

  return {
    id: targetDiscordServer.id,
    name: targetDiscordServer.name,
    iconUrl: toClientAvatarUrl(buildDiscordServerIconUrl(targetDiscordServer.id, targetDiscordServer.iconHash))
  }
}

function serializeTargetDiscordServers(
  targetDiscordServers: Array<{ server: { id: string; name: string; iconHash: string | null } }>
) {
  return targetDiscordServers
    .map((entry) => serializeTargetDiscordServer(entry.server))
    .filter((server): server is NonNullable<ReturnType<typeof serializeTargetDiscordServer>> => server !== null)
}

function toClientDiscordSpaceStatus(status: PlayIntentDiscordSpaceStatus) {
  switch (status) {
    case PlayIntentDiscordSpaceStatus.PROVISIONING:
      return 'provisioning'
    case PlayIntentDiscordSpaceStatus.ACTIVE:
      return 'active'
    case PlayIntentDiscordSpaceStatus.RETAINED:
      return 'retained'
    case PlayIntentDiscordSpaceStatus.DELETE_REQUESTED:
      return 'delete-requested'
    case PlayIntentDiscordSpaceStatus.DELETED:
      return 'deleted'
    case PlayIntentDiscordSpaceStatus.PROVISION_FAILED:
      return 'provision-failed'
    default:
      return 'requested'
  }
}

function serializeDiscordSpace(space: {
  serverId: string;
  status: PlayIntentDiscordSpaceStatus;
  roleName: string | null;
  categoryChannelName: string | null;
  textChannelName: string | null;
  voiceChannelName: string | null;
  deleteAfter: Date | null;
} | null): ActivePlayIntent['discordSpace'] {
  if (!space) {
    return null
  }

  return {
    status: toClientDiscordSpaceStatus(space.status),
    serverId: space.serverId,
    categoryChannelName: space.categoryChannelName,
    textChannelName: space.textChannelName,
    voiceChannelName: space.voiceChannelName,
    deleteAfter: space.deleteAfter?.toISOString() ?? null
  }
}

function serializeActivePlayIntent(intent: {
  id: string;
  headline: string;
  note: string;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  discordSpace: {
    serverId: string;
    status: PlayIntentDiscordSpaceStatus;
    roleName: string | null;
    categoryChannelName: string | null;
    textChannelName: string | null;
    voiceChannelName: string | null;
    deleteAfter: Date | null;
  } | null;
  selectionMode: PrismaPlayIntentSelectionMode;
  scope: PlayIntentScope;
  targetDiscordServers: Array<{ server: { id: string; name: string; iconHash: string | null } }>;
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  platforms: { platformLabel: string }[];
  games: { game: { id: string; title: string; coverUrl: string | null } }[];
  targetFriends: { friendUser: { id: string; handle: string; displayName: string; avatarUrl: string | null } }[];
  _count: { notifications: number };
}, interestedUsers: Array<{ id: string; handle: string; displayName: string; avatarUrl: string | null }>): ActivePlayIntent {
  const primaryPlatform = intent.platforms[0]?.platformLabel ?? 'Unknown'
  const targetServers = serializeTargetDiscordServers(intent.targetDiscordServers)

  return {
    id: intent.id,
    title: intent.headline,
    selectionMode: toClientSelectionMode(intent.selectionMode),
    notifyScope: toClientNotifyScope(intent.scope),
    targetServers,
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
    discordSpace: serializeDiscordSpace(intent.discordSpace),
    windowStartsAt: intent.windowStartsAt.toISOString(),
    windowEndsAt: intent.windowEndsAt.toISOString(),
    expiresAt: intent.expiresAt.toISOString(),
    interestedUsers,
    interestedCount: interestedUsers.length
  }
}

async function getRecipientUserIds(
  userId: string,
  scope: PlayIntentNotifyScope,
  overlappingGameIds: string[],
  explicitFriendUserIds: string[],
  targetUserIds: string[],
  selfAudienceMode: 'exclude' | 'append' | 'only' = 'exclude',
  targetDiscordServerIds: string[] = []
) {
  if (overlappingGameIds.length === 0) {
    return []
  }

  const recipientUserIds = await (scope === 'network'
    ? [...new Set([...explicitFriendUserIds, ...(await getMutualDiscoveryAudienceUserIds(userId))])]
    : scope === 'specific-discord-server'
      ? (() => {
          const loadRecipientUserIds = async () => {
            if (targetDiscordServerIds.length === 0) {
              return []
            }

            const [networkAudienceUserIds, serverAudienceUserIds] = await Promise.all([
              Promise.resolve([...new Set([...explicitFriendUserIds, ...(await getMutualDiscoveryAudienceUserIds(userId))])]),
              getTargetDiscordServersAudienceUserIds(userId, targetDiscordServerIds)
            ])
            const serverAudienceUserIdSet = new Set(serverAudienceUserIds)

            return networkAudienceUserIds.filter((recipientUserId) => serverAudienceUserIdSet.has(recipientUserId))
          }

          return loadRecipientUserIds()
        })()
    : scope === 'specific-friends'
      ? targetUserIds
      : explicitFriendUserIds)

  const recipientUserIdsWithSelf = selfAudienceMode === 'only'
    ? [userId]
    : selfAudienceMode === 'append'
      ? [...new Set([...recipientUserIds, userId])]
      : recipientUserIds

  if (recipientUserIdsWithSelf.length === 0) {
    return []
  }

  const overlappingRecipients = await prisma.userGameInterest.findMany({
    where: {
      userId: {
        in: recipientUserIdsWithSelf
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
      .filter((intent) => !(selfAudienceMode !== 'exclude' && intent.userId === userId))
      .map((intent) => intent.userId)
  )

  return overlappingRecipientUserIds.filter((recipientUserId) => !excludedUserIds.has(recipientUserId))
}

export async function getPlayIntentRecipientUserIds(
  userId: string,
  scope: PlayIntentNotifyScope,
  overlappingGameIds: string[],
  targetUserIds: string[] = [],
  targetDiscordServerIds: string[] = []
) {
  const [user, explicitFriendUserIds] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        isAdmin: true
      }
    }),
    prisma.friend.findMany({
      where: {
        userId
      },
      select: {
        friendedUserId: true
      }
    }).then((friends) => friends.map((friend) => friend.friendedUserId))
  ])

  return getRecipientUserIds(
    userId,
    scope,
    overlappingGameIds,
    explicitFriendUserIds,
    targetUserIds,
    user?.isAdmin ? 'append' : 'exclude',
    targetDiscordServerIds
  )
}

export async function getPlayIntentRecipientUserIdsForDebug(options: {
  userId: string;
  scope: PlayIntentNotifyScope;
  overlappingGameIds: string[];
  targetUserIds?: string[];
  includeSelf?: boolean;
  targetDiscordServerIds?: string[];
}) {
  const explicitFriendUserIds = await prisma.friend.findMany({
    where: {
      userId: options.userId
    },
    select: {
      friendedUserId: true
    }
  }).then((friends) => friends.map((friend) => friend.friendedUserId))

  return getRecipientUserIds(
    options.userId,
    options.scope,
    options.overlappingGameIds,
    explicitFriendUserIds,
    options.targetUserIds ?? [],
    options.includeSelf ? 'append' : 'exclude',
    options.targetDiscordServerIds ?? []
  )
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

  if (!activeIntent) {
    return null
  }

  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId([activeIntent.id])

  return serializeActivePlayIntent(activeIntent, interestedUsersByPlayIntentId.get(activeIntent.id) ?? [])
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

  await expirePendingPlayIntentNotifications(activeIntentIds, {
    notifyAudienceOnEnd: true,
    publishInvalidation: false
  })
}

export async function upsertCurrentPlayIntent(
  userId: string,
  payload: UpsertPlayIntentRequest,
  options: {
    skipCreatorSummarySync?: boolean;
  } = {}
): Promise<UpsertPlayIntentResponse> {
  const [sender, outgoingFriends, libraryEntries] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        displayName: true,
        timezoneId: true,
        isAdmin: true
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

  if (payload.createDiscordSpace && !env.DISCORD_SERVER_ID) {
    throw new PlayIntentValidationError('Temporary Discord channels are not configured yet.')
  }

  if (payload.createDiscordSpace && (payload.voiceChannelId || payload.voiceChannelName)) {
    throw new PlayIntentValidationError('Choose either an existing voice channel or a temporary Discord channel.')
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
  const dmGameEmbeds = payload.selectionMode === 'subset' && selectedEntries.length > 0 && selectedEntries.length < 12
    ? (() => {
        const gamesWithCover = selectedEntries
          .map((entry) => ({
            title: entry.game.title,
            coverUrl: toClientGameCoverUrl(entry.game.coverUrl)
          }))
          .filter((entry): entry is { title: string; coverUrl: string } => Boolean(entry.coverUrl))

        if (gamesWithCover.length === 0) {
          return []
        }

        if (gamesWithCover.length === 1) {
          const firstGame = gamesWithCover[0]!
          return [{
            title: `Game: ${firstGame.title}`,
            image: { url: firstGame.coverUrl }
          }]
        }

        // Multiple games: bullet list with first game's cover as embed image
        const firstGame = gamesWithCover[0]!
        const bulletList = gamesWithCover.map((game) => `• ${game.title}`).join('\n')
        return [{
          title: `${gamesWithCover.length} games`,
          description: bulletList,
          image: { url: firstGame.coverUrl }
        }]
      })()
    : []
  const platformLabels = dedupePlatformLabels(
    selectedEntries.flatMap((entry) => entry.platforms.map((platform) => platform.platformLabel))
  )
  const explicitFriendUsers = outgoingFriends.map((friend) => friend.friendedUser)
  const explicitFriendUserIds = explicitFriendUsers.map((friend) => friend.id)
  const normalizedTargetUserIds = [...new Set(payload.targetUserIds)]
  const normalizedTargetDiscordServerIds = [...new Set(payload.targetDiscordServerIds ?? [])]
  const selectedDiscoveryServerIds = payload.notifyScope === 'specific-discord-server'
    ? await getSelectedDiscordServerIds(userId)
    : []
  const availableTargetDiscordServers = payload.notifyScope === 'specific-discord-server' && normalizedTargetDiscordServerIds.length > 0
    ? await prisma.discordServer.findMany({
        where: {
          id: {
            in: normalizedTargetDiscordServerIds
          }
        },
        select: {
          id: true,
          name: true,
          iconHash: true
        }
      })
    : []
  const availableTargetDiscordServerById = new Map(availableTargetDiscordServers.map((server) => [server.id, server]))
  const targetDiscordServers = payload.notifyScope === 'specific-discord-server'
    ? normalizedTargetDiscordServerIds.map((serverId) => availableTargetDiscordServerById.get(serverId) ?? null)
    : []
  const missingTargetDiscordServerSelection = payload.notifyScope === 'specific-discord-server'
    ? normalizedTargetDiscordServerIds.find((serverId) => !selectedDiscoveryServerIds.includes(serverId) || !availableTargetDiscordServerById.has(serverId)) ?? null
    : null
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

  if (payload.notifyScope === 'specific-discord-server' && (missingTargetDiscordServerSelection || targetDiscordServers.some((server) => !server))) {
    throw new PlayIntentValidationError('Choose Discord servers that are already selected for your network before posting a specific Discord server call to play.')
  }

  const recipientUserIds = await getRecipientUserIds(
    userId,
    payload.notifyScope,
    selectedGameIds,
    explicitFriendUserIds,
    targetedFriends.map((friend) => friend.id),
    payload.includeSelf && sender.isAdmin ? 'only' : 'exclude',
    targetDiscordServers.flatMap((server) => server ? [server.id] : [])
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
  const headline = normalizePlayIntentTitle(payload.title)
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
          discordSpace: {
            select: {
              id: true
            }
          },
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
          createdAt: true,
          user: {
            select: {
              displayName: true,
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
        },
      })
    ])
    : [null, []]
  const priorRecipientStatusByUserId = new Map<string, {
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    interestedUserLabel: string;
  }>()
  for (const notification of priorRecipientNotifications) {
    if (!priorRecipientStatusByUserId.has(notification.userId)) {
      priorRecipientStatusByUserId.set(notification.userId, {
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice,
        interestedUserLabel: notification.user?.identities[0]?.providerUserId
          ? `<@${notification.user.identities[0].providerUserId}>`
          : (notification.user?.displayName ?? notification.userId)
      })
    }
  }
  const priorNotifiedRecipientUserIds = new Set(priorRecipientStatusByUserId.keys())
  const priorInterestedUserLabels = [...priorRecipientStatusByUserId.values()]
    .filter((status) => status.responseChoice === NotificationResponseChoice.JOIN)
    .map((status) => status.interestedUserLabel)
  const updatedFields = latestSupersededIntent
    ? getUpdatedPlayIntentFields({
      previousIntent: latestSupersededIntent,
      nextSelectionMode: payload.selectionMode,
      nextStartsAt: startsAt,
      nextEndsAt: endsAt,
      nextNote: note,
      nextCreateDiscordSpace: payload.createDiscordSpace,
      nextSelectedGameIds: selectedGameIds
    })
    : []
  const isMeaningfulUpdate = updatedFields.length > 0 && priorNotifiedRecipientUserIds.size > 0
  const recipientUserIdsForNotifications = recipientUserIds.filter((recipientUserId) => {
    if (!isMeaningfulUpdate) {
      return !priorNotifiedRecipientUserIds.has(recipientUserId)
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
  const recipientProfiles = recipientUserIds.length > 0
    ? await prisma.user.findMany({
        where: {
          id: {
            in: recipientUserIds
          }
        },
        select: {
          id: true,
          timezoneId: true
        }
      })
    : []
  const recipientTimezoneByUserId = new Map(recipientProfiles.map((profile) => [profile.id, profile.timezoneId]))
  const discordSpaceAudienceGrantUserIds = [...new Set(recipientUserIds.filter((recipientUserId) => recipientUserId !== userId))]

  let activeIntent: ActivePlayIntent | null = null
  let activeIntentId: string | null = null
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
        discordSpace: payload.createDiscordSpace && env.DISCORD_SERVER_ID
          ? {
              create: {
          serverId: env.DISCORD_SERVER_ID,
                status: PlayIntentDiscordSpaceStatus.REQUESTED,
                accessGrants: {
                  create: [
                    {
                      userId,
                      source: PlayIntentDiscordSpaceAccessSource.CREATOR,
                      inServer: false
                    },
                    ...discordSpaceAudienceGrantUserIds.map((recipientUserId) => ({
                      userId: recipientUserId,
                      source: PlayIntentDiscordSpaceAccessSource.AUDIENCE_SYNC,
                      inServer: false
                    }))
                  ]
                }
              }
            }
          : undefined,
        targetDiscordServers: payload.notifyScope === 'specific-discord-server'
          ? {
              create: targetDiscordServers.flatMap((server) => server ? [{ serverId: server.id }] : [])
            }
          : undefined,
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

    const carriedRecipientUserIds = recipientUserIds.filter((recipientUserId) => (
      priorNotifiedRecipientUserIds.has(recipientUserId)
      && !recipientUserIdsForNotifications.includes(recipientUserId)
    ))

    if (carriedRecipientUserIds.length > 0) {
      await Promise.all(
        carriedRecipientUserIds.map((recipientUserId) => {
          const timezoneId = recipientTimezoneByUserId.get(recipientUserId) ?? sender.timezoneId
          const notificationCopy = buildPlayIntentNotificationCopy(
            sender.displayName,
            payload.selectionMode,
            selectedTitles,
            durationMinutes,
            startsAt,
            now,
            timezoneId
          )
          const priorStatus = priorRecipientStatusByUserId.get(recipientUserId)

          return transaction.notification.create({
            data: {
              userId: recipientUserId,
              triggeredByUserId: userId,
              playIntentId: createdIntent.id,
              gameId: payload.selectionMode === 'subset' ? selectedGameIds[0] : null,
              type: NotificationType.FRIEND_PLAYING,
              title: notificationCopy.title,
              body: notificationCopy.body,
              respondedAt: priorStatus?.respondedAt ?? null,
              responseChoice: priorStatus?.responseChoice ?? null
            },
            select: {
              id: true
            }
          })
        })
      )
    }

    if (recipientUserIdsForNotifications.length > 0) {
      createdNotifications = await Promise.all(
        recipientUserIdsForNotifications.map((recipientUserId) => {
          const timezoneId = recipientTimezoneByUserId.get(recipientUserId) ?? sender.timezoneId
          const recipientUpdatedFields = isMeaningfulUpdate && priorNotifiedRecipientUserIds.has(recipientUserId)
            ? updatedFields
            : []
          const notificationCopy = buildPlayIntentNotificationCopy(
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

    activeIntent = serializeActivePlayIntent(createdIntent, [])
    activeIntentId = createdIntent.id
  })

  await expirePendingPlayIntentNotifications(supersededIntentIds, {
    publishInvalidation: false
  })

  let discordSpaceRecipientContexts = new Map<string, PlayIntentDiscordSpaceRecipientContext>()

  if (payload.createDiscordSpace && activeIntentId) {
    await provisionPlayIntentDiscordSpaceByPlayIntentId(activeIntentId)
    discordSpaceRecipientContexts = await getPlayIntentDiscordSpaceRecipientContexts(
      activeIntentId,
      createdNotifications.map((notification) => notification.userId)
    )
  }

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
    const directMessageTargets = createdNotifications
      .flatMap((notification) => {
        const discordUserId = discordUserIdByUserId.get(notification.userId)

        if (!discordUserId) {
          return []
        }

        const sharesServer = recipientUserIdsWithSharedServer.has(notification.userId)
        const voiceChannel = payload.voiceChannelId || payload.voiceChannelName
          ? {
              channelId: payload.voiceChannelId ?? null,
              channelName: payload.voiceChannelName ?? null,
              recipientSharesServer: sharesServer
            }
          : null
        const discordSpace = discordSpaceRecipientContexts.get(notification.userId) ?? null

        return [{
          notificationId: notification.id,
          discordUserId,
          content: buildPlayIntentDirectMessageHeading(notification.title),
          embeds: [
            ...buildPlayIntentDirectMessageEmbeds(
              notification.title,
              notification.body,
              creatorDiscordUserId,
              sender.displayName,
              voiceChannel,
              priorInterestedUserLabels.length > 0 ? priorInterestedUserLabels.length : undefined,
              priorInterestedUserLabels,
              discordSpace
            ),
            ...dmGameEmbeds
          ]
        }]
      })

    if (directMessageTargets.length > 0) {
      const dmResults = await sendDiscordDirectMessages(
        directMessageTargets.map((target) => ({
          discordUserId: target.discordUserId,
          content: target.content,
          embeds: target.embeds,
          components: buildPlayIntentNotificationComponents(
            target.notificationId,
            userId,
            sender.displayName,
            null,
            NotificationType.FRIEND_PLAYING,
            {
              playIntentId: activeIntentId ?? undefined
            }
          )
        }))
      )
      const deliveredTargets = directMessageTargets
        .map((target) => {
          const result = dmResults.find((candidate) => candidate.discordUserId === target.discordUserId && candidate.status === 'sent')

          return result
            && !result.emulated
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

  if (activeIntentId && !options.skipCreatorSummarySync) {
    await syncCreatorPlayIntentSummaryMessages([activeIntentId])
  }

  if (!activeIntent) {
    throw new PlayIntentValidationError('Unable to save your call to play right now.')
  }

  publishPlayIntentInvalidation()

  return {
    activeIntent,
    notifiedFriendCount: deliveredNotificationCount
  }
}
