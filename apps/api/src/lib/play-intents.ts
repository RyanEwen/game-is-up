import type {
  ActivePlayIntent,
  PlayIntentNotifyScope,
  PlayIntentUpdateComparison,
  PlayIntentUpdatedField,
  PlayIntentSelectionMode,
  UpsertPlayIntentRequest,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import {
  resolvePlayIntentUpdatedFields,
  shouldInvalidatePlayIntentAudienceResponse
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
import { editDiscordDirectMessage, sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { deletePlayIntentDirectMessages } from './discord-dm-cleanup.js'
import { toClientGameCoverUrl, toClientAvatarUrl } from './game-media.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import {
  buildDiscordInviteReplyPayload,
  buildPlayIntentDirectMessageHeading,
  buildPlayIntentDirectMessageEmbeds,
  buildPlayIntentNotificationComponents,
  buildPlayIntentNotificationPromptPreview,
  buildPlayIntentUpdatedReplyMessage,
  deleteCreatorResponseSystemNotifications,
  buildGoTimeReminderCopy,
  expirePendingPlayIntentNotifications,
  syncCreatorPlayIntentSummaryMessages
} from './play-intent-notification-responses.js'
import {
  deletePlayIntentDiscordSpaceByPlayIntentId,
  ensurePlayIntentDiscordSpaceAudienceAccess,
  getPlayIntentDiscordSpaceRecipientContexts,
  provisionPlayIntentDiscordSpaceByPlayIntentId,
  type PlayIntentDiscordSpaceRecipientContext
} from './play-intent-discord-spaces.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { prisma } from './prisma.js'
import { formatPlayIntentDurationLabel, formatPlayIntentWindowLabel } from './play-intent-time-format.js'

export class PlayIntentValidationError extends Error {}

export const minimumPlayIntentDurationMinutes = 15
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
      textChannelId: true,
      textChannelName: true,
      voiceChannelId: true,
      voiceChannelName: true,
      inviteUrl: true,
      deleteAfter: true,
      lastSyncError: true
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))]
}

function buildDiscordSpaceAccessGrantCreates(creatorUserId: string, audienceUserIds: string[]) {
  const grants = new Map<string, {
    userId: string;
    source: PlayIntentDiscordSpaceAccessSource;
    inServer: boolean;
  }>()

  grants.set(creatorUserId, {
    userId: creatorUserId,
    source: PlayIntentDiscordSpaceAccessSource.CREATOR,
    inServer: false
  })

  for (const audienceUserId of audienceUserIds) {
    if (grants.has(audienceUserId)) {
      continue
    }

    grants.set(audienceUserId, {
      userId: audienceUserId,
      source: PlayIntentDiscordSpaceAccessSource.AUDIENCE_SYNC,
      inServer: false
    })
  }

  return [...grants.values()]
}

async function syncUpdatedDiscordSpaceAccessGrants(
  transaction: Prisma.TransactionClient,
  options: {
    spaceId: string;
    creatorUserId: string;
    audienceUserIds: string[];
  }
) {
  const desiredGrants = buildDiscordSpaceAccessGrantCreates(options.creatorUserId, options.audienceUserIds)
  const desiredUserIds = desiredGrants.map((grant) => grant.userId)

  await transaction.playIntentDiscordSpaceAccessGrant.updateMany({
    where: {
      spaceId: options.spaceId,
      revokedAt: null,
      userId: {
        notIn: desiredUserIds
      }
    },
    data: {
      revokedAt: new Date()
    }
  })

  for (const grant of desiredGrants) {
    const updatedGrant = await transaction.playIntentDiscordSpaceAccessGrant.updateMany({
      where: {
        spaceId: options.spaceId,
        userId: grant.userId
      },
      data: {
        source: grant.source,
        revokedAt: null
      }
    })

    if (updatedGrant.count > 0) {
      continue
    }

    await transaction.playIntentDiscordSpaceAccessGrant.create({
      data: {
        spaceId: options.spaceId,
        userId: grant.userId,
        source: grant.source,
        inServer: grant.inServer
      }
    })
  }
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

function buildPlayIntentGameEmbeds(games: Array<{ title: string; coverUrl: string | null }>) {
  const gamesWithCover = games
    .map((game) => ({
      title: game.title,
      coverUrl: toClientGameCoverUrl(game.coverUrl)
    }))
    .filter((game): game is { title: string; coverUrl: string } => Boolean(game.coverUrl))

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

  const firstGame = gamesWithCover[0]!
  const bulletList = gamesWithCover.map((game) => `• ${game.title}`).join('\n')

  return [{
    title: `${gamesWithCover.length} games`,
    description: bulletList,
    image: { url: firstGame.coverUrl }
  }]
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

type RecipientActiveIntentOverlapCandidate = {
  userId: string;
  selectionMode: PrismaPlayIntentSelectionMode;
  windowStartsAt: Date;
  windowEndsAt: Date;
  games: Array<{ gameId: string }>;
}

export function doPlayIntentWindowsOverlap(options: {
  leftStartsAt: Date;
  leftEndsAt: Date;
  rightStartsAt: Date;
  rightEndsAt: Date;
}) {
  return options.leftStartsAt.getTime() < options.rightEndsAt.getTime()
    && options.rightStartsAt.getTime() < options.leftEndsAt.getTime()
}

export function excludeRecipientUserIdsWithOverlappingActiveIntents(options: {
  recipientUserIds: string[];
  activeRecipientIntents: RecipientActiveIntentOverlapCandidate[];
  overlappingGameIds: string[];
  playIntentStartsAt: Date;
  playIntentEndsAt: Date;
  creatorUserId: string;
  selfAudienceMode: 'exclude' | 'append' | 'only';
}) {
  const overlappingGameIdSet = new Set(options.overlappingGameIds)
  const excludedUserIds = new Set(
    options.activeRecipientIntents
      .filter((intent) => doPlayIntentWindowsOverlap({
        leftStartsAt: intent.windowStartsAt,
        leftEndsAt: intent.windowEndsAt,
        rightStartsAt: options.playIntentStartsAt,
        rightEndsAt: options.playIntentEndsAt
      }))
      .filter((intent) => intent.selectionMode === PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY
        || intent.games.some((game) => overlappingGameIdSet.has(game.gameId)))
      .filter((intent) => !(options.selfAudienceMode !== 'exclude' && intent.userId === options.creatorUserId))
      .map((intent) => intent.userId)
  )

  return options.recipientUserIds.filter((recipientUserId) => !excludedUserIds.has(recipientUserId))
}

function buildPlayIntentUpdateComparison(options: {
  selectionMode: PlayIntentSelectionMode;
  startsAt: Date;
  endsAt: Date;
  note: string;
  audienceUserIds: string[];
  selectedGameIds: string[];
  hasTemporaryDiscordChannel: boolean;
}): PlayIntentUpdateComparison {
  return {
    timeKey: `${options.startsAt.toISOString()}::${options.endsAt.toISOString()}`,
    gameSelectionKey: options.selectionMode === 'library'
      ? ['mode:library']
      : ['mode:subset', ...options.selectedGameIds],
    note: normalizePlayIntentNote(options.note),
    audienceKey: options.audienceUserIds,
    hasTemporaryDiscordChannel: options.hasTemporaryDiscordChannel
  }
}

function shouldRenotifyPriorDecliner(options: {
  updatedFields: PlayIntentUpdatedField[];
  notifyScope: PlayIntentNotifyScope;
  targetedFriendUserIds: string[];
  recipientUserId: string;
}) {
  if (options.updatedFields.length > 0) {
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

async function findOverlappingOwnedPlayIntent(options: {
  userId: string;
  startsAt: Date;
  endsAt: Date;
  excludePlayIntentId?: string;
}) {
  return prisma.playIntent.findFirst({
    where: {
      userId: options.userId,
      expiresAt: {
        gt: new Date()
      },
      id: options.excludePlayIntentId
        ? {
            not: options.excludePlayIntentId
          }
        : undefined,
      windowStartsAt: {
        lt: options.endsAt
      },
      windowEndsAt: {
        gt: options.startsAt
      }
    },
    select: {
      id: true
    }
  })
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
  textChannelId: string | null;
  textChannelName: string | null;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  inviteUrl: string | null;
  deleteAfter: Date | null;
  lastSyncError: string | null;
} | null): ActivePlayIntent['discordSpace'] {
  if (!space) {
    return null
  }

  return {
    status: toClientDiscordSpaceStatus(space.status),
    serverId: space.serverId,
    categoryChannelName: space.categoryChannelName,
    textChannelName: space.textChannelName,
    textChannelUrl: buildDiscordChannelUrl(space.serverId, space.textChannelId),
    voiceChannelName: space.voiceChannelName,
    voiceChannelUrl: buildDiscordChannelUrl(space.serverId, space.voiceChannelId),
    inviteUrl: space.inviteUrl,
    deleteAfter: space.deleteAfter?.toISOString() ?? null,
    lastSyncError: space.lastSyncError
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
    textChannelId: string | null;
    textChannelName: string | null;
    voiceChannelId: string | null;
    voiceChannelName: string | null;
    inviteUrl: string | null;
    deleteAfter: Date | null;
    lastSyncError: string | null;
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
  targetDiscordServerIds: string[] = [],
  timeWindow?: {
    startsAt: Date;
    endsAt: Date;
  }
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

  const activeIntentWindowStart = timeWindow?.startsAt ?? new Date()
  const activeRecipientIntents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: overlappingRecipientUserIds
      },
      expiresAt: {
        gt: activeIntentWindowStart
      },
      ...(timeWindow
        ? {
            windowStartsAt: {
              lt: timeWindow.endsAt
            }
          }
        : {})
    },
    select: {
      userId: true,
      selectionMode: true,
      windowStartsAt: true,
      windowEndsAt: true,
      games: {
        select: {
          gameId: true
        }
      }
    }
  })

  if (!timeWindow) {
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

  return excludeRecipientUserIdsWithOverlappingActiveIntents({
    recipientUserIds: overlappingRecipientUserIds,
    activeRecipientIntents,
    overlappingGameIds,
    playIntentStartsAt: timeWindow.startsAt,
    playIntentEndsAt: timeWindow.endsAt,
    creatorUserId: userId,
    selfAudienceMode
  })
}

export async function getPlayIntentRecipientUserIds(
  userId: string,
  scope: PlayIntentNotifyScope,
  overlappingGameIds: string[],
  targetUserIds: string[] = [],
  targetDiscordServerIds: string[] = [],
  timeWindow?: {
    startsAt: Date;
    endsAt: Date;
  }
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
    targetDiscordServerIds,
    timeWindow
  )
}

export async function getPlayIntentRecipientUserIdsForDebug(options: {
  userId: string;
  scope: PlayIntentNotifyScope;
  overlappingGameIds: string[];
  targetUserIds?: string[];
  includeSelf?: boolean;
  targetDiscordServerIds?: string[];
  startsAt?: Date;
  endsAt?: Date;
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
    options.targetDiscordServerIds ?? [],
    options.startsAt && options.endsAt
      ? {
          startsAt: options.startsAt,
          endsAt: options.endsAt
        }
      : undefined
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

const retroactivePlayIntentNotificationTypes: NotificationType[] = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
]

type RetroactivePlayIntentCandidate = Awaited<ReturnType<typeof loadRetroactivePlayIntentCandidates>>[number]

type RetroactiveNotificationDraft = {
  playIntentId: string;
  creatorUserId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  creatorDisplayName: string;
  creatorDiscordUserId: string | null;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  interestedUserLabels: string[];
  gameEmbeds: ReturnType<typeof buildPlayIntentGameEmbeds>;
}

async function loadRetroactivePlayIntentCandidates(options: {
  recipientUserId: string;
  candidateCreatorUserIds: string[];
  candidateDiscordServerIds: string[];
  now: Date;
}) {
  const candidateClauses: Prisma.PlayIntentWhereInput[] = []

  if (options.candidateCreatorUserIds.length > 0) {
    candidateClauses.push({
      userId: {
        in: options.candidateCreatorUserIds
      }
    })
  }

  if (options.candidateDiscordServerIds.length > 0) {
    candidateClauses.push({
      scope: PlayIntentScope.SPECIFIC_DISCORD_SERVER,
      targetDiscordServers: {
        some: {
          serverId: {
            in: options.candidateDiscordServerIds
          }
        }
      }
    })
  }

  if (candidateClauses.length === 0) {
    return []
  }

  return prisma.playIntent.findMany({
    where: {
      userId: {
        not: options.recipientUserId
      },
      expiresAt: {
        gt: options.now
      },
      OR: candidateClauses
    },
    select: {
      id: true,
      userId: true,
      selectionMode: true,
      scope: true,
      windowStartsAt: true,
      windowEndsAt: true,
      voiceChannelId: true,
      voiceChannelName: true,
      games: {
        select: {
          gameId: true,
          game: {
            select: {
              title: true,
              coverUrl: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
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
      },
      targetFriends: {
        select: {
          friendUserId: true
        }
      },
      targetDiscordServers: {
        select: {
          serverId: true
        }
      },
      notifications: {
        where: {
          type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
        },
        select: {
          responseChoice: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      }
    },
    orderBy: [
      {
        windowStartsAt: 'asc'
      },
      {
        createdAt: 'asc'
      }
    ]
  })
}

function buildRetroactiveNotificationDraft(options: {
  intent: RetroactivePlayIntentCandidate;
  now: Date;
  recipientTimezoneId: string | null;
  interestedUserLabels: string[];
}) {
  const selectionMode = toClientSelectionMode(options.intent.selectionMode)
  const selectedGames = [...options.intent.games]
    .map((game) => ({
      gameId: game.gameId,
      title: game.game.title,
      coverUrl: game.game.coverUrl
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
  const selectedTitles = selectedGames.map((game) => game.title)
  const durationMinutes = Math.max(
    minimumPlayIntentDurationMinutes,
    Math.ceil((options.intent.windowEndsAt.getTime() - options.intent.windowStartsAt.getTime()) / (60 * 1000))
  )
  const latestCheckIn = options.intent.notifications[0] ?? null
  const notificationType = latestCheckIn?.responseChoice === NotificationResponseChoice.CONFIRMED
    ? NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
    : NotificationType.FRIEND_PLAYING
  const copy = notificationType === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
    ? buildGoTimeReminderCopy(options.intent.user.displayName)
    : buildPlayIntentNotificationCopy(
        options.intent.user.displayName,
        selectionMode,
        selectedTitles,
        durationMinutes,
        options.intent.windowStartsAt,
        options.now,
        options.recipientTimezoneId
      )

  return {
    playIntentId: options.intent.id,
    creatorUserId: options.intent.userId,
    notificationType,
    title: copy.title,
    body: copy.body,
    creatorDisplayName: options.intent.user.displayName,
    creatorDiscordUserId: options.intent.user.identities[0]?.providerUserId ?? null,
    voiceChannelId: options.intent.voiceChannelId,
    voiceChannelName: options.intent.voiceChannelName,
    interestedUserLabels: options.interestedUserLabels,
    gameEmbeds: notificationType === NotificationType.FRIEND_PLAYING ? buildPlayIntentGameEmbeds(selectedGames) : []
  } satisfies RetroactiveNotificationDraft
}

export async function backfillPlayIntentNotificationsForUserLibraryChange(userId: string) {
  const now = new Date()
  const [recipient, playableLibraryEntries, mutedCreators, discoveryAudienceUserIds, targetableDiscordServerIds, explicitFriendships, recipientDiscordIdentity] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        timezoneId: true
      }
    }),
    getPlayableLibraryEntries(userId),
    prisma.playIntentMute.findMany({
      where: {
        userId
      },
      select: {
        mutedUserId: true
      }
    }),
    getMutualDiscoveryAudienceUserIds(userId),
    getSelectedDiscordServerIds(userId),
    prisma.friend.findMany({
      where: {
        friendedUserId: userId
      },
      select: {
        userId: true
      }
    }),
    prisma.userIdentity.findFirst({
      where: {
        userId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    })
  ])

  if (!recipient || playableLibraryEntries.length === 0) {
    return {
      createdCount: 0,
      deliveredCount: 0
    }
  }

  const mutedCreatorIds = new Set(mutedCreators.map((mute) => mute.mutedUserId))
  const candidateCreatorUserIds = [...new Set([
    ...explicitFriendships.map((friend) => friend.userId),
    ...discoveryAudienceUserIds
  ])].filter((candidateUserId) => !mutedCreatorIds.has(candidateUserId))
  const candidateIntents = await loadRetroactivePlayIntentCandidates({
    recipientUserId: userId,
    candidateCreatorUserIds,
    candidateDiscordServerIds: targetableDiscordServerIds,
    now
  })

  if (candidateIntents.length === 0) {
    return {
      createdCount: 0,
      deliveredCount: 0
    }
  }

  const existingNotifications = await prisma.notification.findMany({
    where: {
      userId,
      playIntentId: {
        in: candidateIntents.map((intent) => intent.id)
      },
      type: {
        in: retroactivePlayIntentNotificationTypes
      }
    },
    select: {
      playIntentId: true
    }
  })
  const existingNotificationPlayIntentIds = new Set(
    existingNotifications
      .map((notification) => notification.playIntentId)
      .filter((playIntentId): playIntentId is string => Boolean(playIntentId))
  )
  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId(candidateIntents.map((intent) => intent.id))
  const recipientGameIds = [...new Set(playableLibraryEntries.map((entry) => entry.gameId))]
  const drafts: RetroactiveNotificationDraft[] = []

  for (const intent of candidateIntents) {
    if (existingNotificationPlayIntentIds.has(intent.id)) {
      continue
    }

    const recipientUserIds = await getPlayIntentRecipientUserIds(
      intent.userId,
      toClientNotifyScope(intent.scope),
      intent.selectionMode === PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY
        ? recipientGameIds
        : intent.games.map((game) => game.gameId),
      intent.targetFriends.map((friend) => friend.friendUserId),
      intent.targetDiscordServers.map((server) => server.serverId),
      {
        startsAt: intent.windowStartsAt,
        endsAt: intent.windowEndsAt
      }
    )

    if (!recipientUserIds.includes(userId)) {
      continue
    }

    drafts.push(buildRetroactiveNotificationDraft({
      intent,
      now,
      recipientTimezoneId: recipient.timezoneId,
      interestedUserLabels: (interestedUsersByPlayIntentId.get(intent.id) ?? []).map((entry) => entry.displayName)
    }))
  }

  if (drafts.length === 0) {
    return {
      createdCount: 0,
      deliveredCount: 0
    }
  }

  const draftByPlayIntentId = new Map(drafts.map((draft) => [draft.playIntentId, draft]))
  const createdNotifications = await prisma.$transaction(async (transaction) => {
    const created: Array<{
      id: string;
      playIntentId: string;
      type: NotificationType;
      title: string;
      body: string;
    }> = []

    for (const draft of drafts) {
      const existingNotification = await transaction.notification.findFirst({
        where: {
          userId,
          playIntentId: draft.playIntentId,
          type: {
            in: retroactivePlayIntentNotificationTypes
          }
        },
        select: {
          id: true
        }
      })

      if (existingNotification) {
        continue
      }

      const createdNotification = await transaction.notification.create({
        data: {
          userId,
          triggeredByUserId: draft.creatorUserId,
          playIntentId: draft.playIntentId,
          type: draft.notificationType,
          title: draft.title,
          body: draft.body
        },
        select: {
          id: true,
          playIntentId: true,
          type: true,
          title: true,
          body: true
        }
      })

      if (!createdNotification.playIntentId) {
        continue
      }

      created.push({
        ...createdNotification,
        playIntentId: createdNotification.playIntentId
      })
    }

    return created
  })

  if (createdNotifications.length === 0) {
    return {
      createdCount: 0,
      deliveredCount: 0
    }
  }

  await Promise.all(
    createdNotifications.map((notification) => ensurePlayIntentDiscordSpaceAudienceAccess(notification.playIntentId, [userId]))
  )

  const creatorIdsWithVoiceChannels = [...new Set(
    createdNotifications
      .map((notification) => draftByPlayIntentId.get(notification.playIntentId))
      .filter((draft): draft is RetroactiveNotificationDraft => Boolean(draft?.voiceChannelId))
      .map((draft) => draft.creatorUserId)
  )]
  const [creatorMemberships, recipientMemberships] = await Promise.all([
    creatorIdsWithVoiceChannels.length > 0
      ? prisma.discordServerMembership.findMany({
          where: {
            userId: {
              in: creatorIdsWithVoiceChannels
            }
          },
          select: {
            userId: true,
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ userId: string; serverId: string }>),
    creatorIdsWithVoiceChannels.length > 0
      ? prisma.discordServerMembership.findMany({
          where: {
            userId
          },
          select: {
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ serverId: string }>)
  ])
  const creatorServerIdsByUserId = new Map<string, Set<string>>()

  for (const membership of creatorMemberships) {
    const serverIds = creatorServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    serverIds.add(membership.serverId)
    creatorServerIdsByUserId.set(membership.userId, serverIds)
  }

  const recipientServerIdSet = new Set(recipientMemberships.map((membership) => membership.serverId))
  const discordSpaceContexts = await Promise.all(
    createdNotifications.map(async (notification) => ({
      playIntentId: notification.playIntentId,
      context: (await getPlayIntentDiscordSpaceRecipientContexts(notification.playIntentId, [userId])).get(userId) ?? null
    }))
  )
  const discordSpaceContextByPlayIntentId = new Map(discordSpaceContexts.map((entry) => [entry.playIntentId, entry.context]))
  let deliveredCount = 0

  if (recipientDiscordIdentity?.providerUserId) {
    for (const notification of createdNotifications) {
      const draft = draftByPlayIntentId.get(notification.playIntentId)

      if (!draft) {
        continue
      }

      const creatorServerIds = creatorServerIdsByUserId.get(draft.creatorUserId) ?? new Set<string>()
      const sharesServer = [...creatorServerIds].some((serverId) => recipientServerIdSet.has(serverId))
      const voiceChannel = draft.voiceChannelId || draft.voiceChannelName
        ? {
            channelId: draft.voiceChannelId,
            channelName: draft.voiceChannelName,
            recipientSharesServer: sharesServer
          }
        : null
      const preview = buildPlayIntentNotificationPromptPreview({
        notificationId: notification.id,
        playIntentId: draft.playIntentId,
        notificationType: draft.notificationType,
        title: draft.title,
        body: draft.body,
        responseChoice: null,
        creatorUserId: draft.creatorUserId,
        creatorDiscordUserId: draft.creatorDiscordUserId,
        creatorDisplayName: draft.creatorDisplayName,
        voiceChannel,
        discordSpace: discordSpaceContextByPlayIntentId.get(draft.playIntentId) ?? null,
        interestedCount: draft.interestedUserLabels.length > 0 ? draft.interestedUserLabels.length : undefined,
        interestedUserLabels: draft.interestedUserLabels
      })
      const [dmResult] = await sendDiscordDirectMessages([
        {
          discordUserId: recipientDiscordIdentity.providerUserId,
          content: preview.content,
          embeds: [...(preview.embeds ?? []), ...draft.gameEmbeds],
          components: preview.components
        }
      ])

      if (!dmResult || dmResult.status !== 'sent' || dmResult.emulated) {
        continue
      }

      deliveredCount += 1

      await prisma.notification.update({
        where: {
          id: notification.id
        },
        data: {
          deliveredAt: new Date(),
          discordDmChannelId: dmResult.channelId,
          discordDmMessageId: dmResult.messageId
        }
      })
    }
  }

  await syncCreatorPlayIntentSummaryMessages(createdNotifications.map((notification) => notification.playIntentId))

  return {
    createdCount: createdNotifications.length,
    deliveredCount
  }
}

export async function getCurrentPlayIntent(userId: string) {
  const now = new Date()
  const expiredIntentIds = (await prisma.playIntent.findMany({
    where: {
      userId,
      deletedAt: null,
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
      deletedAt: null,
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

export async function clearCurrentPlayIntent(userId: string, playIntentId?: string) {
  const now = new Date()
  const activeIntentIds = (await prisma.playIntent.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(playIntentId
        ? {
            id: playIntentId
          }
        : {}),
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
      deletedAt: null,
      ...(playIntentId
        ? {
            id: playIntentId
          }
        : {}),
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

  if (activeIntentIds.length > 0) {
    publishPlayIntentInvalidation()
  }
}

export async function deletePlayIntentWithAdminCleanup(playIntentId: string) {
  const playIntent = await prisma.playIntent.findUnique({
    where: {
      id: playIntentId
    },
    select: {
      id: true,
      expiresAt: true,
      deletedAt: true
    }
  })

  if (!playIntent || playIntent.deletedAt) {
    throw new PlayIntentValidationError('Call to play not found.')
  }

  const now = new Date()

  if (playIntent.expiresAt > now) {
    await prisma.playIntent.update({
      where: {
        id: playIntentId
      },
      data: {
        expiresAt: now,
        windowEndsAt: now,
        deletedAt: now
      }
    })
  } else {
    await prisma.playIntent.update({
      where: {
        id: playIntentId
      },
      data: {
        deletedAt: now
      }
    })
  }

  await prisma.notification.updateMany({
    where: {
      playIntentId,
      type: {
        in: [
          NotificationType.FRIEND_PLAYING,
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ]
      },
      respondedAt: null
    },
    data: {
      respondedAt: now,
      responseChoice: NotificationResponseChoice.EXPIRED
    }
  })

  await Promise.all([
    deletePlayIntentDiscordSpaceByPlayIntentId(playIntentId),
    deletePlayIntentDirectMessages(playIntentId)
  ])

  publishPlayIntentInvalidation()
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
    throw new PlayIntentValidationError('Temporary Discord channel support is not configured yet.')
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
    ? buildPlayIntentGameEmbeds(selectedEntries.map((entry) => ({
        title: entry.game.title,
        coverUrl: entry.game.coverUrl
      })))
    : []
  const platformLabels = dedupePlatformLabels(
    selectedEntries.flatMap((entry) => entry.platforms.map((platform) => platform.platformLabel))
  )
  const explicitFriendUsers = outgoingFriends.map((friend) => friend.friendedUser)
  const explicitFriendUserIds = explicitFriendUsers.map((friend) => friend.id)
  const normalizedTargetUserIds = normalizeStringArray(payload.targetUserIds)
  const normalizedTargetDiscordServerIds = normalizeStringArray(payload.targetDiscordServerIds)
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

  const now = new Date()
  const { startsAt, durationMinutes, endsAt } = resolvePlayIntentWindow(payload, now)
  const recipientUserIds = await getRecipientUserIds(
    userId,
    payload.notifyScope,
    selectedGameIds,
    explicitFriendUserIds,
    targetedFriends.map((friend) => friend.id),
    payload.includeSelf && sender.isAdmin ? 'only' : 'exclude',
    targetDiscordServers.flatMap((server) => server ? [server.id] : []),
    {
      startsAt,
      endsAt
    }
  )
  const editingPlayIntentId = payload.playIntentId ?? null

  if (editingPlayIntentId) {
    const editableIntent = await prisma.playIntent.findFirst({
      where: {
        id: editingPlayIntentId,
        userId,
        expiresAt: {
          gt: now
        }
      },
      select: {
        id: true
      }
    })

    if (!editableIntent) {
      throw new PlayIntentValidationError('That call to play is no longer active.')
    }
  }

  const overlappingIntent = await findOverlappingOwnedPlayIntent({
    userId,
    startsAt,
    endsAt,
    excludePlayIntentId: editingPlayIntentId ?? undefined
  })

  if (overlappingIntent) {
    throw new PlayIntentValidationError('This call to play overlaps one of your other active calls. Adjust the timing so your calls do not overlap.')
  }

  const headline = normalizePlayIntentTitle(payload.title)
  const note = payload.note?.trim() ?? ''
  const [existingIntent, priorRecipientNotifications] = editingPlayIntentId
    ? await Promise.all([
      prisma.playIntent.findUnique({
        where: {
          id: editingPlayIntentId
        },
        select: {
          id: true,
          selectionMode: true,
          windowStartsAt: true,
          windowEndsAt: true,
          note: true,
          discordSpace: {
            select: {
              id: true,
              status: true
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
          playIntentId: editingPlayIntentId,
          type: NotificationType.FRIEND_PLAYING
        },
        select: {
          id: true,
          userId: true,
          respondedAt: true,
          responseChoice: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
          recipientResponseDiscordDmChannelId: true,
          recipientResponseDiscordDmMessageId: true,
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
    notificationId: string;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    discordDmChannelId: string | null;
    discordDmMessageId: string | null;
    recipientResponseDiscordDmChannelId: string | null;
    recipientResponseDiscordDmMessageId: string | null;
    interestedUserLabel: string;
  }>()
  for (const notification of priorRecipientNotifications) {
    if (!priorRecipientStatusByUserId.has(notification.userId)) {
      priorRecipientStatusByUserId.set(notification.userId, {
        notificationId: notification.id,
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice,
        discordDmChannelId: notification.discordDmChannelId,
        discordDmMessageId: notification.discordDmMessageId,
        recipientResponseDiscordDmChannelId: notification.recipientResponseDiscordDmChannelId,
        recipientResponseDiscordDmMessageId: notification.recipientResponseDiscordDmMessageId,
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
  const updatedFields = existingIntent
    ? resolvePlayIntentUpdatedFields(
      buildPlayIntentUpdateComparison({
        selectionMode: toClientSelectionMode(existingIntent.selectionMode),
        startsAt: existingIntent.windowStartsAt,
        endsAt: existingIntent.windowEndsAt,
        note: existingIntent.note,
        audienceUserIds: [...priorNotifiedRecipientUserIds],
        selectedGameIds: existingIntent.games.map((entry) => entry.gameId),
        hasTemporaryDiscordChannel: Boolean(existingIntent.discordSpace)
      }),
      buildPlayIntentUpdateComparison({
        selectionMode: payload.selectionMode,
        startsAt,
        endsAt,
        note,
        audienceUserIds: recipientUserIds,
        selectedGameIds,
        hasTemporaryDiscordChannel: payload.createDiscordSpace
      })
    )
    : []
  const shouldInvalidateAudienceResponse = shouldInvalidatePlayIntentAudienceResponse(updatedFields)
  const isMeaningfulUpdate = updatedFields.length > 0 && priorNotifiedRecipientUserIds.size > 0
  const reusedRecipientUserIds = recipientUserIds.filter((recipientUserId) => priorNotifiedRecipientUserIds.has(recipientUserId))
  const newRecipientUserIds = recipientUserIds.filter((recipientUserId) => !priorNotifiedRecipientUserIds.has(recipientUserId))
  const removedRecipientStatuses = [...priorRecipientStatusByUserId.entries()]
    .filter(([recipientUserId]) => !recipientUserIds.includes(recipientUserId))
    .map(([, status]) => status)
  const removedPendingNotificationIds = removedRecipientStatuses
    .filter((status) => status.respondedAt == null)
    .map((status) => status.notificationId)
  const removedResolvedNotificationIds = removedRecipientStatuses
    .filter((status) => status.respondedAt != null)
    .map((status) => status.notificationId)
  const removedResolvedRecipientUserIds = [...priorRecipientStatusByUserId.entries()]
    .filter(([recipientUserId, status]) => !recipientUserIds.includes(recipientUserId) && status.respondedAt != null)
    .map(([recipientUserId]) => recipientUserId)
  const renotifiedRecipientUserIds = new Set(recipientUserIds.filter((recipientUserId) => {
    if (!isMeaningfulUpdate || !priorNotifiedRecipientUserIds.has(recipientUserId)) {
      return false
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
  }))
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
  const discordSpaceAccessGrantCreates = buildDiscordSpaceAccessGrantCreates(userId, discordSpaceAudienceGrantUserIds)
  const visibleInterestedUserLabels = shouldInvalidateAudienceResponse ? [] : priorInterestedUserLabels
  const targetDiscordServerCreates = targetDiscordServers.flatMap((server) => server ? [{ serverId: server.id }] : [])
  const targetFriendCreates = targetedFriends.map((friend) => ({
    friendUserId: friend.id
  }))
  const platformCreates = platformLabels.map((platformLabel) => ({
    platformLabel
  }))
  const selectedGameCreates = selectedGameIds.map((gameId) => ({
    gameId
  }))
  const existingDiscordSpace = existingIntent?.discordSpace ?? null
  const shouldReuseDiscordSpace = Boolean(
    payload.createDiscordSpace
    && existingDiscordSpace
    && existingDiscordSpace.status !== PlayIntentDiscordSpaceStatus.DELETED
  )
  const shouldCreateDiscordSpace = Boolean(
    payload.createDiscordSpace
    && env.DISCORD_SERVER_ID
    && !shouldReuseDiscordSpace
  )
  const shouldDeleteDiscordSpace = Boolean(
    editingPlayIntentId
    && existingDiscordSpace
    && existingDiscordSpace.status !== PlayIntentDiscordSpaceStatus.DELETED
    && !payload.createDiscordSpace
  )
  const shouldDropDeletedDiscordSpace = Boolean(
    editingPlayIntentId
    && existingDiscordSpace?.status === PlayIntentDiscordSpaceStatus.DELETED
  )
  const discordSpaceCreate = shouldCreateDiscordSpace
    ? {
        create: {
          serverId: env.DISCORD_SERVER_ID!,
          status: PlayIntentDiscordSpaceStatus.REQUESTED,
          accessGrants: {
            create: discordSpaceAccessGrantCreates
          }
        }
      }
    : undefined

  let activeIntent: ActivePlayIntent | null = null
  let activeIntentId: string | null = null
  let reusedDiscordSpace = false
  const revokedCreatorResponseRecipientUserIds = new Set<string>(removedResolvedRecipientUserIds)
  const outboundNotifications: Array<{
    id: string;
    userId: string;
    title: string;
    body: string;
    responseChoice: NotificationResponseChoice | null;
    discordDmChannelId: string | null;
    discordDmMessageId: string | null;
    recipientResponseDiscordDmChannelId: string | null;
    recipientResponseDiscordDmMessageId: string | null;
    sendUpdateReply: boolean;
    requiresFreshResponse: boolean;
  }> = []

  await prisma.$transaction(async (transaction) => {
    if (shouldDropDeletedDiscordSpace && existingDiscordSpace) {
      await transaction.playIntentDiscordSpace.delete({
        where: {
          id: existingDiscordSpace.id
        }
      })
    }

    let savedIntent: Prisma.PlayIntentGetPayload<{ include: typeof activePlayIntentInclude }>

    if (editingPlayIntentId) {
      savedIntent = await transaction.playIntent.update({
          where: {
            id: editingPlayIntentId
          },
          data: {
            selectionMode: toPrismaSelectionMode(payload.selectionMode),
            headline,
            note,
            voiceChannelId: payload.voiceChannelId ?? null,
            voiceChannelName: payload.voiceChannelName ?? null,
            discordSpace: discordSpaceCreate,
            targetDiscordServers: {
              deleteMany: {},
              ...(payload.notifyScope === 'specific-discord-server'
                ? {
                    create: targetDiscordServerCreates
                  }
                : {})
            },
            scope: toPrismaNotifyScope(payload.notifyScope),
            windowStartsAt: startsAt,
            windowEndsAt: endsAt,
            expiresAt: endsAt,
            platforms: {
              deleteMany: {},
              create: platformCreates
            },
            targetFriends: {
              deleteMany: {},
              ...(payload.notifyScope === 'specific-friends'
                ? {
                    create: targetFriendCreates
                  }
                : {})
            },
            games: {
              deleteMany: {},
              ...(payload.selectionMode === 'subset'
                ? {
                    create: selectedGameCreates
                  }
                : {})
            }
          },
          include: activePlayIntentInclude
        })
    } else {
      savedIntent = await transaction.playIntent.create({
          data: {
            userId,
            selectionMode: toPrismaSelectionMode(payload.selectionMode),
            headline,
            note,
            voiceChannelId: payload.voiceChannelId ?? null,
            voiceChannelName: payload.voiceChannelName ?? null,
            discordSpace: discordSpaceCreate,
            targetDiscordServers: payload.notifyScope === 'specific-discord-server'
              ? {
                  create: targetDiscordServerCreates
                }
              : undefined,
            scope: toPrismaNotifyScope(payload.notifyScope),
            windowStartsAt: startsAt,
            windowEndsAt: endsAt,
            expiresAt: endsAt,
            platforms: {
              create: platformCreates
            },
            targetFriends: payload.notifyScope === 'specific-friends'
              ? {
                  create: targetFriendCreates
                }
              : undefined,
            games: payload.selectionMode === 'library'
              ? undefined
              : {
                  create: selectedGameCreates
                }
          },
          include: activePlayIntentInclude
            })
        }

    if (shouldReuseDiscordSpace && existingDiscordSpace) {
      reusedDiscordSpace = true

      await transaction.playIntentDiscordSpace.update({
        where: {
          id: existingDiscordSpace.id
        },
        data: {
          playIntentId: savedIntent.id,
          status: existingDiscordSpace.status === PlayIntentDiscordSpaceStatus.RETAINED
            || existingDiscordSpace.status === PlayIntentDiscordSpaceStatus.DELETE_REQUESTED
            ? PlayIntentDiscordSpaceStatus.ACTIVE
            : existingDiscordSpace.status,
          deleteAfter: null,
          deleteRequestedAt: null,
          deletedAt: null,
          lastSyncError: null
        }
      })

      await syncUpdatedDiscordSpaceAccessGrants(transaction, {
        spaceId: existingDiscordSpace.id,
        creatorUserId: userId,
        audienceUserIds: discordSpaceAudienceGrantUserIds
      })
    }

    if (reusedRecipientUserIds.length > 0) {
      const reusedNotifications = await Promise.all(
        reusedRecipientUserIds.map((recipientUserId) => {
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
          const shouldSendUpdateReply = renotifiedRecipientUserIds.has(recipientUserId)

          if (!priorStatus) {
            throw new PlayIntentValidationError('Unable to refresh the existing invite for this recipient.')
          }

          const shouldResetAudienceResponse = shouldSendUpdateReply && shouldInvalidateAudienceResponse
          const requiresFreshResponse = shouldResetAudienceResponse && (
            priorStatus.respondedAt != null
            || priorStatus.responseChoice === NotificationResponseChoice.JOIN
            || priorStatus.responseChoice === NotificationResponseChoice.DECLINE
          )

          return transaction.notification.update({
            where: {
              id: priorStatus.notificationId
            },
            data: {
              triggeredByUserId: userId,
              playIntentId: savedIntent.id,
              gameId: payload.selectionMode === 'subset' ? selectedGameIds[0] : null,
              type: NotificationType.FRIEND_PLAYING,
              title: notificationCopy.title,
              body: notificationCopy.body,
              respondedAt: shouldResetAudienceResponse ? null : priorStatus.respondedAt,
              responseChoice: shouldResetAudienceResponse ? null : priorStatus.responseChoice,
              recipientResponseDiscordDmChannelId: priorStatus.recipientResponseDiscordDmChannelId,
              recipientResponseDiscordDmMessageId: priorStatus.recipientResponseDiscordDmMessageId
            },
            select: {
              id: true,
              userId: true,
              title: true,
              body: true,
              responseChoice: true,
              discordDmChannelId: true,
              discordDmMessageId: true,
              recipientResponseDiscordDmChannelId: true,
              recipientResponseDiscordDmMessageId: true
            }
          }).then((notification) => ({
            ...notification,
            requiresFreshResponse
          }))
        })
      )

      for (const notification of reusedNotifications) {
        if (notification.requiresFreshResponse) {
          revokedCreatorResponseRecipientUserIds.add(notification.userId)
        }
      }

      outboundNotifications.push(...reusedNotifications.map((notification) => ({
        ...notification,
        sendUpdateReply: renotifiedRecipientUserIds.has(notification.userId),
        requiresFreshResponse: notification.requiresFreshResponse
      })))
    }

    if (newRecipientUserIds.length > 0) {
      const createdNotifications = await Promise.all(
        newRecipientUserIds.map((recipientUserId) => {
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

          return transaction.notification.create({
            data: {
              userId: recipientUserId,
              triggeredByUserId: userId,
              playIntentId: savedIntent.id,
              gameId: payload.selectionMode === 'subset' ? selectedGameIds[0] : null,
              type: NotificationType.FRIEND_PLAYING,
              title: notificationCopy.title,
              body: notificationCopy.body
            },
            select: {
              id: true,
              userId: true,
              title: true,
              body: true,
              responseChoice: true,
              discordDmChannelId: true,
              discordDmMessageId: true,
              recipientResponseDiscordDmChannelId: true,
              recipientResponseDiscordDmMessageId: true
            }
          })
        })
      )

      outboundNotifications.push(...createdNotifications.map((notification) => ({
        ...notification,
        sendUpdateReply: false,
        requiresFreshResponse: false
      })))
    }

    if (removedPendingNotificationIds.length > 0) {
      await transaction.notification.updateMany({
        where: {
          id: {
            in: removedPendingNotificationIds
          }
        },
        data: {
          playIntentId: null,
          respondedAt: now,
          responseChoice: NotificationResponseChoice.EXPIRED
        }
      })
    }

    if (removedResolvedNotificationIds.length > 0) {
      await transaction.notification.updateMany({
        where: {
          id: {
            in: removedResolvedNotificationIds
          }
        },
        data: {
          playIntentId: null
        }
      })
    }

    activeIntent = serializeActivePlayIntent(savedIntent, [])
    activeIntentId = savedIntent.id
  })

  let discordSpaceRecipientContexts = new Map<string, PlayIntentDiscordSpaceRecipientContext>()
  const outboundRecipientUserIds = [...new Set(outboundNotifications.map((notification) => notification.userId))]

  if (payload.createDiscordSpace && activeIntentId) {
    await provisionPlayIntentDiscordSpaceByPlayIntentId(activeIntentId)
    discordSpaceRecipientContexts = await getPlayIntentDiscordSpaceRecipientContexts(
      activeIntentId,
      outboundRecipientUserIds
    )

    if (reusedDiscordSpace) {
      const refreshedIntent = await prisma.playIntent.findUnique({
        where: {
          id: activeIntentId
        },
        include: activePlayIntentInclude
      })

      if (refreshedIntent) {
        activeIntent = serializeActivePlayIntent(refreshedIntent, [])
      }
    }
  }

  if (shouldDeleteDiscordSpace && activeIntentId) {
    const deletedSpace = await deletePlayIntentDiscordSpaceByPlayIntentId(activeIntentId)

    if (deletedSpace.status === 'deleted') {
      await prisma.playIntentDiscordSpace.deleteMany({
        where: {
          playIntentId: activeIntentId,
          status: PlayIntentDiscordSpaceStatus.DELETED
        }
      })
    }

    const refreshedIntent = await prisma.playIntent.findUnique({
      where: {
        id: activeIntentId
      },
      include: activePlayIntentInclude
    })

    if (refreshedIntent) {
      activeIntent = serializeActivePlayIntent(refreshedIntent, [])
    }
  }

  if (activeIntentId && revokedCreatorResponseRecipientUserIds.size > 0) {
    await deleteCreatorResponseSystemNotifications({
      playIntentId: activeIntentId,
      creatorUserId: userId,
      recipientUserIds: [...revokedCreatorResponseRecipientUserIds]
    })
  }

  let deliveredNotificationCount = 0

  if (outboundNotifications.length > 0) {
    const [recipientIdentities, creatorIdentity, creatorServerIds] = await Promise.all([
      prisma.userIdentity.findMany({
        where: {
          provider: AuthProvider.DISCORD,
          userId: {
            in: outboundRecipientUserIds
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
            userId: { in: outboundRecipientUserIds },
            serverId: { in: creatorServerIds }
          },
          select: { userId: true }
        })
      : []
    const recipientUserIdsWithSharedServer = new Set(recipientServerMemberships.map((m) => m.userId))

    const creatorDiscordUserId = creatorIdentity?.providerUserId ?? null
    const discordUserIdByUserId = new Map(recipientIdentities.map((identity) => [identity.userId, identity.providerUserId]))
    const directMessageTargets = outboundNotifications.map((notification) => {
      const discordUserId = discordUserIdByUserId.get(notification.userId) ?? null
      const sharesServer = recipientUserIdsWithSharedServer.has(notification.userId)
      const voiceChannel = payload.voiceChannelId || payload.voiceChannelName
        ? {
            channelId: payload.voiceChannelId ?? null,
            channelName: payload.voiceChannelName ?? null,
            recipientSharesServer: sharesServer
          }
        : null
      const discordSpace = discordSpaceRecipientContexts.get(notification.userId) ?? null

      return {
          notificationId: notification.id,
          notificationType: NotificationType.FRIEND_PLAYING,
          discordUserId,
          content: buildPlayIntentDirectMessageHeading(notification.title),
          embeds: [
            ...buildPlayIntentDirectMessageEmbeds(
              notification.title,
              notification.body,
              creatorDiscordUserId,
              sender.displayName,
              voiceChannel,
              visibleInterestedUserLabels.length > 0 ? visibleInterestedUserLabels.length : undefined,
              visibleInterestedUserLabels,
              discordSpace,
              {
                intentDetails: {
                  headline: payload.title?.trim() || null,
                  selectionMode: payload.selectionMode,
                  selectedGameTitles: selectedTitles,
                  scope: toPrismaNotifyScope(payload.notifyScope),
                  targetDiscordServers: targetDiscordServers.flatMap((server) => server ? [{ server: { name: server.name } }] : []),
                  targetFriends: targetedFriends.map((friend) => ({
                    friendUser: {
                      displayName: friend.displayName
                    }
                  })),
                  note
                },
                summaryStatus: startsAt.getTime() > now.getTime() + 60 * 1000 ? 'scheduled' : 'live'
              }
            ),
            ...dmGameEmbeds
          ],
          components: buildPlayIntentNotificationComponents(
            notification.id,
            userId,
            sender.displayName,
            notification.responseChoice,
            NotificationType.FRIEND_PLAYING,
            {
              playIntentId: activeIntentId ?? undefined
            }
          ),
          discordDmChannelId: notification.discordDmChannelId,
          discordDmMessageId: notification.discordDmMessageId,
          inviteUrl: discordSpace?.inviteUrl ?? null,
          recipientResponseDiscordDmChannelId: notification.recipientResponseDiscordDmChannelId,
          recipientResponseDiscordDmMessageId: notification.recipientResponseDiscordDmMessageId,
          sendUpdateReply: notification.sendUpdateReply,
          requiresFreshResponse: notification.requiresFreshResponse
      }
    })

    for (const target of directMessageTargets) {
      const updateReplyContent = target.sendUpdateReply
        ? buildPlayIntentUpdatedReplyMessage(updatedFields, {
            requiresFreshResponse: target.requiresFreshResponse
          })
        : null

      if (target.discordDmChannelId && target.discordDmMessageId) {
        const editResult = await editDiscordDirectMessage({
          channelId: target.discordDmChannelId,
          messageId: target.discordDmMessageId,
          content: target.content,
          embeds: target.embeds,
          components: target.components
        })

        if (editResult.status === 'edited') {
          deliveredNotificationCount += 1

          if (updateReplyContent && target.discordUserId) {
            await sendDiscordDirectMessages([{
              discordUserId: target.discordUserId,
              content: updateReplyContent,
              components: [],
              replyTo: {
                channelId: target.discordDmChannelId,
                messageId: target.discordDmMessageId
              }
            }])
          }

          continue
        }
      }

      if (!target.discordUserId) {
        continue
      }

      const [dmResult] = await sendDiscordDirectMessages([{
        discordUserId: target.discordUserId,
        content: target.content,
        embeds: target.embeds,
        components: target.components
      }])

      if (!dmResult || dmResult.status !== 'sent') {
        continue
      }

      if (!dmResult.emulated) {
        deliveredNotificationCount += 1

        await prisma.notification.update({
          where: {
            id: target.notificationId
          },
          data: {
            deliveredAt: new Date(),
            discordDmChannelId: dmResult.channelId,
            discordDmMessageId: dmResult.messageId
          }
        })

        const inviteReply = target.notificationType === NotificationType.FRIEND_PLAYING
          && target.discordUserId
          && dmResult.channelId
          && dmResult.messageId
          ? buildDiscordInviteReplyPayload({
              discordUserId: target.discordUserId,
              inviteUrl: target.inviteUrl,
              replyTo: {
                channelId: dmResult.channelId,
                messageId: dmResult.messageId
              }
            })
          : null

        if (inviteReply) {
          await sendDiscordDirectMessages([inviteReply])
        }

        if (updateReplyContent && target.discordUserId && dmResult.channelId && dmResult.messageId) {
          await sendDiscordDirectMessages([{
            discordUserId: target.discordUserId,
            content: updateReplyContent,
            components: [],
            replyTo: {
              channelId: dmResult.channelId,
              messageId: dmResult.messageId
            }
          }])
        }
      }
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
