import type { PlayIntentFeed, PlayIntentPreview } from '@game-is-up/shared'
import { GameIntentType, NotificationResponseChoice, NotificationType, PlayIntentDiscordSpaceStatus, PlayIntentSelectionMode, PlayIntentScope } from '@prisma/client'
import {
  buildDiscordServerIconUrl,
  getDiscordMembershipServerIds,
  getMutualDiscoveryAudienceUserIds
} from './discord-servers.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { toClientGameCoverUrl, toClientAvatarUrl } from './game-media.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import { prisma } from './prisma.js'
import { getViewer } from './demo-viewer.js'

const recentClosedIntentWindowMs = 24 * 60 * 60 * 1000

function toSelectionMode(selectionMode: PlayIntentSelectionMode): 'library' | 'subset' {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toNotifyScope(scope: PlayIntentScope): 'friends-only' | 'network' | 'specific-friends' | 'specific-discord-server' {
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

function formatAvailabilityLabel(displayName: string, startsAt: Date, now: Date) {
  return startsAt.getTime() > now.getTime() + 60 * 1000
    ? `${displayName} starts ${startsAt.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}`
    : `${displayName} is available now`
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

function toDiscordSpaceStatus(status: PlayIntentDiscordSpaceStatus) {
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
} | null): PlayIntentPreview['discordSpace'] {
  if (!space) {
    return null
  }

  return {
    status: toDiscordSpaceStatus(space.status),
    serverId: space.serverId,
    categoryChannelName: space.categoryChannelName,
    textChannelName: space.textChannelName,
    textChannelUrl: buildDiscordChannelUrl(space.serverId, space.textChannelId),
    voiceChannelName: space.voiceChannelName,
    voiceChannelUrl: buildDiscordChannelUrl(space.serverId, space.voiceChannelId),
    inviteUrl: space.inviteUrl,
    deleteAfter: space.deleteAfter?.toISOString() ?? null
  }
}

export async function buildPlayIntentFeed(viewerId?: string | null): Promise<PlayIntentFeed> {
  const viewer = await getViewer(viewerId)
  const now = new Date()
  const recentClosedCutoff = new Date(now.getTime() - recentClosedIntentWindowMs)

  if (!viewer) {
    return {
      generatedAt: now.toISOString(),
      intents: []
    }
  }

  const [viewerFriends, viewerInterests, discoveryAudienceUserIds, viewerServerIds, mutedUserIds] = await Promise.all([
    prisma.friend.findMany({
      where: {
        userId: viewer.id
      },
      select: {
        friendedUserId: true
      }
    }),
    prisma.userGameInterest.findMany({
      where: {
        userId: viewer.id,
        intentType: {
          not: GameIntentType.COMPLETED
        }
      },
      select: {
        gameId: true
      }
    }),
    getMutualDiscoveryAudienceUserIds(viewer.id),
    getDiscordMembershipServerIds(viewer.id),
    prisma.playIntentMute.findMany({
      where: { userId: viewer.id },
      select: { mutedUserId: true }
    }).then((rows) => rows.map((row) => row.mutedUserId))
  ])

  const friendUserIds = viewerFriends.map((friend) => friend.friendedUserId)
  const mutedUserIdSet = new Set(mutedUserIds)
  const broadAudienceUserIds = [...new Set([...friendUserIds, ...discoveryAudienceUserIds])]
    .filter((id) => !mutedUserIdSet.has(id))
  const viewerGameIds = viewerInterests.map((interest) => interest.gameId)

  const intents = await prisma.playIntent.findMany({
    where: {
      expiresAt: {
        gt: recentClosedCutoff
      },
      OR: [
        {
          userId: {
            in: broadAudienceUserIds
          }
        },
        {
          userId: viewer.id,
          expiresAt: {
            lte: now
          }
        }
      ]
    },
    include: {
      user: {
        include: {
          gameInterests: {
            where: {
              intentType: {
                not: GameIntentType.COMPLETED
              }
            },
            include: {
              game: true
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
      games: {
        include: {
          game: true
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
          deleteAfter: true
        }
      },
      platforms: true,
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
    },
    orderBy: {
      windowStartsAt: 'asc'
    }
  })

  const recipientNotificationStateByPlayIntentId = intents.length > 0
    ? await prisma.notification.findMany({
        where: {
          userId: viewer.id,
          playIntentId: {
            in: intents.map((intent) => intent.id)
          },
          type: {
            in: [
              NotificationType.FRIEND_PLAYING,
              NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
              NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
            ]
          }
        },
        select: {
          playIntentId: true,
          responseChoice: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }).then((rows) => {
        const map = new Map<string, {
          isNotified: true;
          responseChoice: 'interested' | 'pass' | null;
        }>()

        for (const row of rows) {
          if (!row.playIntentId || map.has(row.playIntentId)) {
            continue
          }

          map.set(row.playIntentId, {
            isNotified: true,
            responseChoice: row.responseChoice === NotificationResponseChoice.JOIN
              ? 'interested'
              : row.responseChoice === NotificationResponseChoice.DECLINE
                ? 'pass'
                : null
          })
        }

        return map
      })
    : new Map<string, {
        responseChoice: 'interested' | 'pass' | null;
      }>()
  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId(intents.map((intent) => intent.id))

  const previews = intents
    .map<PlayIntentPreview | null>((intent) => {
      const isOwnIntent = intent.userId === viewer.id
      const isExplicitFriend = friendUserIds.includes(intent.userId)
      const isInDiscoveryAudience = discoveryAudienceUserIds.includes(intent.userId)

      if ((intent.scope as string) === 'CLOSED') {
        return null
      }

      if (!isOwnIntent && intent.scope === PlayIntentScope.FRIENDS_ONLY && !isExplicitFriend) {
        return null
      }

      if (!isOwnIntent && intent.scope === PlayIntentScope.MUTUAL_FRIENDS && !isExplicitFriend && !isInDiscoveryAudience) {
        return null
      }

      const targetServerIds = intent.targetDiscordServers.map((entry) => entry.serverId)

      if (
        !isOwnIntent
        && intent.scope === PlayIntentScope.SPECIFIC_DISCORD_SERVER
        && !targetServerIds.some((serverId) => viewerServerIds.includes(serverId))
      ) {
        return null
      }

      if (
        !isOwnIntent
        && intent.scope === PlayIntentScope.SPECIFIC_FRIENDS
        && !intent.targetFriends.some((entry) => entry.friendUserId === viewer.id)
      ) {
        return null
      }

      const overlappingLibraryGames = intent.user.gameInterests.filter((interest) => viewerGameIds.includes(interest.gameId))
      const selectedGames = intent.games
        .map((entry) => ({
          id: entry.game.id,
          title: entry.game.title,
          platform: intent.platforms[0]?.platformLabel ?? 'Unknown',
          coverUrl: toClientGameCoverUrl(entry.game.coverUrl)
        }))
        .sort((left, right) => left.title.localeCompare(right.title))
      const matchingSelectedGames = intent.games.filter((entry) => viewerGameIds.includes(entry.gameId))
      const appliesToViewer = isOwnIntent
        ? true
        : intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
          ? overlappingLibraryGames.length > 0
          : matchingSelectedGames.length > 0

      const interestedUsers = interestedUsersByPlayIntentId.get(intent.id) ?? []

      const targetServers = serializeTargetDiscordServers(intent.targetDiscordServers)
      const recipientNotificationState = recipientNotificationStateByPlayIntentId.get(intent.id)

      return {
        id: intent.id,
        title: intent.headline,
        status: intent.expiresAt.getTime() > now.getTime() ? 'active' : 'closed',
        appliesToViewer,
        user: {
          id: intent.user.id,
          handle: intent.user.handle,
          displayName: intent.user.displayName,
          avatarUrl: toClientAvatarUrl(intent.user.avatarUrl)
        },
        selectionMode: toSelectionMode(intent.selectionMode),
        notifyScope: toNotifyScope(intent.scope),
        targetServers,
        platforms: intent.platforms.map((platform) => platform.platformLabel).sort((left, right) => left.localeCompare(right)),
        games: intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? [] : selectedGames,
        note: intent.note,
        voiceChannelId: intent.voiceChannelId,
        voiceChannelName: intent.voiceChannelName,
        discordSpace: serializeDiscordSpace(intent.discordSpace),
        viewerResponseChoice: recipientNotificationState?.responseChoice ?? null,
        interestedUsers,
        interestedCount: interestedUsers.length,
        availabilityWindow: {
          label: formatAvailabilityLabel(intent.user.displayName, intent.windowStartsAt, now),
          startsAt: intent.windowStartsAt.toISOString(),
          endsAt: intent.windowEndsAt.toISOString()
        }
      }
    })
    .filter((preview): preview is PlayIntentPreview => preview !== null)

  return {
    generatedAt: now.toISOString(),
    intents: previews
  }
}