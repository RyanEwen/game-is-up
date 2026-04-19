import type { PlayIntentDetail, PlayIntentExpandedGame } from '@game-is-up/shared'
import {
  GameIntentType,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentDiscordSpaceStatus,
  PlayIntentScope,
  PlayIntentSelectionMode
} from '@prisma/client'
import { getViewer } from './demo-viewer.js'
import {
  buildDiscordServerIconUrl,
  getDiscordMembershipServerIds,
  getMutualDiscoveryAudienceUserIds
} from './discord-servers.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { toClientAvatarUrl, toClientGameCoverUrl } from './game-media.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import { prisma } from './prisma.js'

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

function isViewerIncludedByPlayIntentAudience({
  isOwnIntent,
  hasDirectNotification,
  scope,
  isExplicitFriend,
  isInDiscoveryAudience,
  isTargetedFriend,
  isTargetedServer
}: {
  isOwnIntent: boolean;
  hasDirectNotification: boolean;
  scope: PlayIntentScope;
  isExplicitFriend: boolean;
  isInDiscoveryAudience: boolean;
  isTargetedFriend: boolean;
  isTargetedServer: boolean;
}) {
  if (isOwnIntent || hasDirectNotification) {
    return true
  }

  switch (scope) {
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return isTargetedFriend
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return isTargetedServer
    case PlayIntentScope.MUTUAL_FRIENDS:
      return isExplicitFriend || isInDiscoveryAudience
    default:
      return isExplicitFriend
  }
}

function isPlayIntentVisibleToViewer({
  isOwnIntent,
  hasDirectNotification,
  scope,
  isExplicitFriend,
  isInDiscoveryAudience,
  isTargetedFriend,
  isTargetedServer
}: {
  isOwnIntent: boolean;
  hasDirectNotification: boolean;
  scope: PlayIntentScope;
  isExplicitFriend: boolean;
  isInDiscoveryAudience: boolean;
  isTargetedFriend: boolean;
  isTargetedServer: boolean;
}) {
  if (isOwnIntent || hasDirectNotification) {
    return true
  }

  switch (scope) {
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return isExplicitFriend || isInDiscoveryAudience || isTargetedFriend
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return isExplicitFriend || isInDiscoveryAudience || isTargetedServer
    case PlayIntentScope.MUTUAL_FRIENDS:
      return isExplicitFriend || isInDiscoveryAudience
    default:
      return isExplicitFriend
  }
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
  categoryChannelName: string | null;
  textChannelId: string | null;
  textChannelName: string | null;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  inviteUrl: string | null;
  deleteAfter: Date | null;
} | null): PlayIntentDetail['discordSpace'] {
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

function dedupePlatformLabels(platformLabels: string[]) {
  return [...new Set(platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

function serializeExpandedGames(
  interests: Array<{
    gameId: string;
    game: {
      title: string;
      coverUrl: string | null;
      platforms: Array<{ platformLabel: string }>;
    };
    platforms: Array<{ platformLabel: string }>;
  }>
): PlayIntentExpandedGame[] {
  const byGameId = new Map<string, PlayIntentExpandedGame>()

  for (const interest of interests) {
    const existing = byGameId.get(interest.gameId)
    const platformLabels = dedupePlatformLabels([
      ...interest.platforms.map((platform) => platform.platformLabel),
      ...interest.game.platforms.map((platform) => platform.platformLabel)
    ])

    if (!existing) {
      byGameId.set(interest.gameId, {
        id: interest.gameId,
        title: interest.game.title,
        coverUrl: toClientGameCoverUrl(interest.game.coverUrl),
        platformLabels: platformLabels.length > 0 ? platformLabels : ['Unknown']
      })
      continue
    }

    existing.platformLabels = dedupePlatformLabels([...existing.platformLabels, ...platformLabels])
    existing.coverUrl = existing.coverUrl ?? toClientGameCoverUrl(interest.game.coverUrl)
  }

  return [...byGameId.values()].sort((left, right) => left.title.localeCompare(right.title))
}

function buildAudienceSummary(options: {
  isOwnIntent: boolean;
  scope: PlayIntentScope;
  targetDiscordServers: Array<{ server: { name: string } }>;
  targetFriends: Array<{ friendUser: { displayName: string } }>;
}) {
  if (options.scope === PlayIntentScope.SPECIFIC_DISCORD_SERVER) {
    const names = options.targetDiscordServers.map((entry) => entry.server.name)

    return names.length > 0
      ? `Only matching people from these Discord servers can receive this call: ${names.join(', ')}.`
      : 'Only matching people from the selected Discord servers can receive this call.'
  }

  if (options.scope === PlayIntentScope.SPECIFIC_FRIENDS) {
    const names = options.targetFriends.map((entry) => entry.friendUser.displayName)

    if (options.isOwnIntent && names.length > 0) {
      return `Only these specific friends can receive this call when their libraries match: ${names.join(', ')}.`
    }

    return 'Only the specific friends chosen for this call can receive it when their libraries match.'
  }

  if (options.scope === PlayIntentScope.MUTUAL_FRIENDS) {
    return 'Matching people in the creator\'s selected Discord network, plus direct friends, can receive this call.'
  }

  return 'Only direct friends who have matching games can receive this call.'
}

export async function buildPlayIntentDetail(viewerId: string, playIntentId: string): Promise<PlayIntentDetail | null> {
  const viewer = await getViewer(viewerId)

  if (!viewer) {
    return null
  }

  const now = new Date()
  const [viewerFriends, viewerInterests, discoveryAudienceUserIds, viewerServerIds, mutedUserIds, intent] = await Promise.all([
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
      include: {
        platforms: {
          select: {
            platformLabel: true
          },
          orderBy: {
            platformLabel: 'asc'
          }
        },
        game: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            platforms: {
              select: {
                platformLabel: true
              },
              orderBy: {
                platformLabel: 'asc'
              }
            }
          }
        }
      }
    }),
    getMutualDiscoveryAudienceUserIds(viewer.id),
    getDiscordMembershipServerIds(viewer.id),
    prisma.playIntentMute.findMany({
      where: { userId: viewer.id },
      select: { mutedUserId: true }
    }).then((rows) => rows.map((row) => row.mutedUserId)),
    prisma.playIntent.findUnique({
      where: {
        id: playIntentId
      },
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            avatarUrl: true,
            gameInterests: {
              where: {
                intentType: {
                  not: GameIntentType.COMPLETED
                }
              },
              include: {
                platforms: {
                  select: {
                    platformLabel: true
                  },
                  orderBy: {
                    platformLabel: 'asc'
                  }
                },
                game: {
                  select: {
                    id: true,
                    title: true,
                    coverUrl: true,
                    platforms: {
                      select: {
                        platformLabel: true
                      },
                      orderBy: {
                        platformLabel: 'asc'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        targetFriends: {
          select: {
            friendUserId: true,
            friendUser: {
              select: {
                id: true,
                handle: true,
                displayName: true,
                avatarUrl: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
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
            game: {
              select: {
                id: true,
                title: true,
                coverUrl: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        },
        discordSpace: {
          select: {
            serverId: true,
            status: true,
            categoryChannelName: true,
            textChannelId: true,
            textChannelName: true,
            voiceChannelId: true,
            voiceChannelName: true,
            inviteUrl: true,
            deleteAfter: true
          }
        },
        platforms: {
          select: {
            platformLabel: true
          },
          orderBy: {
            platformLabel: 'asc'
          }
        },
        notifications: {
          where: {
            userId: viewer.id,
            type: {
              in: [
                NotificationType.FRIEND_PLAYING,
                NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
                NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
                NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
              ]
            }
          },
          select: {
            responseChoice: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })
  ])

  if (!intent) {
    return null
  }

  const friendUserIds = viewerFriends.map((friend) => friend.friendedUserId)
  const viewerGameIdSet = new Set(viewerInterests.map((interest) => interest.gameId))
  const mutedUserIdSet = new Set(mutedUserIds)
  const isOwnIntent = intent.userId === viewer.id
  const isExplicitFriend = friendUserIds.includes(intent.userId)
  const isInDiscoveryAudience = discoveryAudienceUserIds.includes(intent.userId)
  const targetServerIds = intent.targetDiscordServers.map((entry) => entry.serverId)
  const isTargetedServer = targetServerIds.some((serverId) => viewerServerIds.includes(serverId))
  const isTargetedFriend = intent.targetFriends.some((entry) => entry.friendUserId === viewer.id)
  const hasDirectNotification = intent.notifications.length > 0

  if (!isOwnIntent && !hasDirectNotification && mutedUserIdSet.has(intent.userId)) {
    return null
  }

  if (!isPlayIntentVisibleToViewer({
    isOwnIntent,
    hasDirectNotification,
    scope: intent.scope,
    isExplicitFriend,
    isInDiscoveryAudience,
    isTargetedFriend,
    isTargetedServer
  })) {
    return null
  }

  const overlappingLibraryInterests = intent.user.gameInterests.filter((interest) => viewerGameIdSet.has(interest.gameId))
  const matchingSelectedGames = intent.games.filter((entry) => viewerGameIdSet.has(entry.gameId))
  const matchesViewerLibrary = intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
    ? overlappingLibraryInterests.length > 0
    : matchingSelectedGames.length > 0
  const appliesToViewer = isViewerIncludedByPlayIntentAudience({
    isOwnIntent,
    hasDirectNotification,
    scope: intent.scope,
    isExplicitFriend,
    isInDiscoveryAudience,
    isTargetedFriend,
    isTargetedServer
  }) && matchesViewerLibrary
  const recipientNotificationState = intent.notifications[0] ?? null
  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId([intent.id])
  const interestedUsers = interestedUsersByPlayIntentId.get(intent.id) ?? []
  const targetServers = serializeTargetDiscordServers(intent.targetDiscordServers)
  const primaryPlatform = intent.platforms[0]?.platformLabel ?? 'Unknown'
  const expandedGameScope = intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
    ? (() => {
        if (isOwnIntent) {
          const games = serializeExpandedGames(intent.user.gameInterests)

          return {
            kind: 'creator-library' as const,
            title: 'Games currently covered by this call',
            description: games.length > 0
              ? 'This call is library-wide, so every active title in your library is currently included.'
              : 'This call is library-wide, but your library does not currently expose any active titles.',
            totalCount: games.length,
            games
          }
        }

        const games = serializeExpandedGames(overlappingLibraryInterests)

        return {
          kind: 'shared-library' as const,
          title: 'Games you can use for this call',
          description: games.length > 0
            ? `This call is library-wide, so these are the current overlaps between your library and ${intent.user.displayName}'s library.`
            : `This call is library-wide, but none of your current games overlap with ${intent.user.displayName}'s library right now.`,
          totalCount: games.length,
          games
        }
      })()
    : null

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
    platforms: intent.platforms.map((platform) => platform.platformLabel),
    games: intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
      ? []
      : intent.games
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
    viewerResponseChoice: recipientNotificationState?.responseChoice === NotificationResponseChoice.JOIN
      ? 'interested'
      : recipientNotificationState?.responseChoice === NotificationResponseChoice.DECLINE
        ? 'pass'
        : null,
    interestedUsers,
    interestedCount: interestedUsers.length,
    availabilityWindow: {
      label: formatAvailabilityLabel(intent.user.displayName, intent.windowStartsAt, now),
      startsAt: intent.windowStartsAt.toISOString(),
      endsAt: intent.windowEndsAt.toISOString()
    },
    createdAt: intent.createdAt.toISOString(),
    audienceSummary: buildAudienceSummary({
      isOwnIntent,
      scope: intent.scope,
      targetDiscordServers: intent.targetDiscordServers,
      targetFriends: intent.targetFriends
    }),
    targetedFriends: isOwnIntent
      ? intent.targetFriends
        .map((entry) => ({
          id: entry.friendUser.id,
          handle: entry.friendUser.handle,
          displayName: entry.friendUser.displayName,
          avatarUrl: toClientAvatarUrl(entry.friendUser.avatarUrl)
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
      : [],
    expandedGameScope
  }
}
