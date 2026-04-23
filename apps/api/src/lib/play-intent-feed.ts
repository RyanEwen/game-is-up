import type { PlayIntentFeed, PlayIntentPreview } from '@game-is-up/shared'
import { GameIntentType, NotificationResponseChoice, NotificationType, PlayIntentSelectionMode, PlayIntentScope } from '@prisma/client'
import {
  getDiscordMembershipServerIds,
  getMutualDiscoveryAudienceUserIds
} from './discord-servers.js'
import { toClientGameCoverUrl, toClientAvatarUrl } from './game-media.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import {
  formatAvailabilityLabel,
  isPlayIntentVisibleToViewer,
  isViewerIncludedByPlayIntentAudience,
  serializeDiscordSpaceSummary,
  serializeTargetDiscordServers,
  toNotifyScope,
  toSelectionMode
} from './play-intent-serializers.js'
import { prisma } from './prisma.js'
import { getViewer } from './demo-viewer.js'

const recentEndedIntentWindowMs = 30 * 24 * 60 * 60 * 1000

export async function buildPlayIntentFeed(viewerId?: string | null): Promise<PlayIntentFeed> {
  const viewer = await getViewer(viewerId)
  const now = new Date()
  const recentEndedCutoff = new Date(now.getTime() - recentEndedIntentWindowMs)

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
      deletedAt: null,
      expiresAt: {
        gt: recentEndedCutoff
      },
      userId: mutedUserIds.length > 0
        ? {
            notIn: mutedUserIds
          }
        : undefined,
      OR: [
        {
          userId: viewer.id
        },
        {
          userId: {
            in: broadAudienceUserIds
          }
        },
        {
          scope: PlayIntentScope.SPECIFIC_FRIENDS,
          targetFriends: {
            some: {
              friendUserId: viewer.id
            }
          }
        },
        {
          scope: PlayIntentScope.SPECIFIC_DISCORD_SERVER,
          targetDiscordServers: {
            some: {
              serverId: {
                in: viewerServerIds
              }
            }
          }
        },
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
          deleteAfter: true,
          lastSyncError: true
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

      const targetServerIds = intent.targetDiscordServers.map((entry) => entry.serverId)
      const isTargetedServer = targetServerIds.some((serverId) => viewerServerIds.includes(serverId))
      const isTargetedFriend = intent.targetFriends.some((entry) => entry.friendUserId === viewer.id)

      if (!isPlayIntentVisibleToViewer({
        isOwnIntent,
        scope: intent.scope,
        isExplicitFriend,
        isInDiscoveryAudience,
        isTargetedFriend,
        isTargetedServer
      })) {
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
      const matchesViewerLibrary = intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
        ? overlappingLibraryGames.length > 0
        : matchingSelectedGames.length > 0
      const appliesToViewer = isViewerIncludedByPlayIntentAudience({
        isOwnIntent,
        scope: intent.scope,
        isExplicitFriend,
        isInDiscoveryAudience,
        isTargetedFriend,
        isTargetedServer
      }) && matchesViewerLibrary

      const interestedUsers = interestedUsersByPlayIntentId.get(intent.id) ?? []

      const targetServers = serializeTargetDiscordServers(intent.targetDiscordServers)
      const recipientNotificationState = recipientNotificationStateByPlayIntentId.get(intent.id)

      return {
        id: intent.id,
        title: intent.headline,
        status: intent.expiresAt.getTime() > now.getTime() ? 'active' : 'ended',
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
        discordSpace: serializeDiscordSpaceSummary(intent.discordSpace),
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