import type { PlayIntentFeed, PlayIntentPreview } from '@game-is-up/shared'
import { GameIntentType, NotificationResponseChoice, NotificationType, PlayIntentSelectionMode, PlayIntentScope } from '@prisma/client'
import { getMutualDiscoveryAudienceUserIds } from './discord-servers.js'
import { toClientGameCoverUrl, toClientAvatarUrl } from './game-media.js'
import { prisma } from './prisma.js'
import { getViewer } from './demo-viewer.js'

function toSelectionMode(selectionMode: PlayIntentSelectionMode): 'library' | 'subset' {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toNotifyScope(scope: PlayIntentScope): 'friends-only' | 'network' | 'specific-friends' {
  switch (scope) {
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

export async function buildPlayIntentFeed(viewerId?: string | null): Promise<PlayIntentFeed> {
  const viewer = await getViewer(viewerId)
  const now = new Date()

  if (!viewer) {
    return {
      generatedAt: now.toISOString(),
      intents: []
    }
  }

  const [viewerFriends, viewerInterests, discoveryAudienceUserIds, mutedUserIds] = await Promise.all([
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

  if (broadAudienceUserIds.length === 0) {
    return {
      generatedAt: now.toISOString(),
      intents: []
    }
  }

  const intents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: broadAudienceUserIds
      },
      expiresAt: {
        gt: now
      }
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
      games: {
        include: {
          game: true
        }
      },
      platforms: true,
      _count: {
        select: {
          notifications: {
            where: {
              responseChoice: NotificationResponseChoice.JOIN,
              type: {
                in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER] as NotificationType[]
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

  const recipientResponseByPlayIntentId = intents.length > 0
    ? await prisma.notification.findMany({
        where: {
          userId: viewer.id,
          playIntentId: {
            in: intents.map((intent) => intent.id)
          },
          type: {
            in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER]
          },
          responseChoice: {
            in: [NotificationResponseChoice.JOIN, NotificationResponseChoice.DECLINE]
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
        const map = new Map<string, 'join' | 'decline'>()

        for (const row of rows) {
          if (!row.playIntentId || map.has(row.playIntentId)) {
            continue
          }

          map.set(row.playIntentId, row.responseChoice === NotificationResponseChoice.JOIN ? 'join' : 'decline')
        }

        return map
      })
    : new Map<string, 'join' | 'decline'>()

  const previews = intents
    .map<PlayIntentPreview | null>((intent) => {
      const isExplicitFriend = friendUserIds.includes(intent.userId)
      const isInDiscoveryAudience = discoveryAudienceUserIds.includes(intent.userId)

      if ((intent.scope as string) === 'CLOSED') {
        return null
      }

      if (intent.scope === PlayIntentScope.FRIENDS_ONLY && !isExplicitFriend) {
        return null
      }

      if (intent.scope === PlayIntentScope.MUTUAL_FRIENDS && !isExplicitFriend && !isInDiscoveryAudience) {
        return null
      }

      if (intent.scope === PlayIntentScope.SPECIFIC_FRIENDS && !intent.targetFriends.some((entry) => entry.friendUserId === viewer.id)) {
        return null
      }

      const overlappingLibraryGames = intent.user.gameInterests.filter((interest) => viewerGameIds.includes(interest.gameId))
      const selectedGames = intent.games
        .filter((entry) => viewerGameIds.includes(entry.gameId))
        .map((entry) => ({
          id: entry.game.id,
          title: entry.game.title,
          platform: intent.platforms[0]?.platformLabel ?? 'Unknown',
          coverUrl: toClientGameCoverUrl(entry.game.coverUrl)
        }))
        .sort((left, right) => left.title.localeCompare(right.title))

      if (intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY && overlappingLibraryGames.length === 0) {
        return null
      }

      if (intent.selectionMode === PlayIntentSelectionMode.SELECTED_GAMES && selectedGames.length === 0) {
        return null
      }

      return {
        id: intent.id,
        title: intent.headline,
        user: {
          id: intent.user.id,
          handle: intent.user.handle,
          displayName: intent.user.displayName,
          avatarUrl: toClientAvatarUrl(intent.user.avatarUrl)
        },
        selectionMode: toSelectionMode(intent.selectionMode),
        notifyScope: toNotifyScope(intent.scope),
        platforms: intent.platforms.map((platform) => platform.platformLabel).sort((left, right) => left.localeCompare(right)),
        games: intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? [] : selectedGames,
        note: intent.note,
        voiceChannelId: intent.voiceChannelId,
        voiceChannelName: intent.voiceChannelName,
        viewerResponseChoice: recipientResponseByPlayIntentId.get(intent.id) ?? null,
        joinCount: intent._count.notifications,
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