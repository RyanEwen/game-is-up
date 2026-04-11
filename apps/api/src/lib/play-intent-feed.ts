import type { PlayIntentFeed, PlayIntentPreview } from '@game-is-up/shared'
import { GameIntentType, PlayIntentSelectionMode, PlayIntentScope } from '@prisma/client'
import { getMutualDiscoveryAudienceUserIds } from './discord-servers.js'
import { prisma } from './prisma.js'
import { getViewer } from './demo-viewer.js'

function toSelectionMode(selectionMode: PlayIntentSelectionMode): 'library' | 'subset' {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toNotifyScope(scope: PlayIntentScope): 'friends-only' | 'discovery-and-friends' {
  switch (scope) {
    case PlayIntentScope.MUTUAL_FRIENDS:
      return 'discovery-and-friends'
    default:
      return 'friends-only'
  }
}

export async function buildPlayIntentFeed(viewerId?: string | null): Promise<PlayIntentFeed> {
  const viewer = await getViewer(viewerId)

  if (!viewer) {
    return {
      generatedAt: new Date().toISOString(),
      intents: []
    }
  }

  const [viewerFriends, viewerInterests, discoveryAudienceUserIds] = await Promise.all([
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
    getMutualDiscoveryAudienceUserIds(viewer.id)
  ])

  const friendUserIds = viewerFriends.map((friend) => friend.friendedUserId)
  const broadAudienceUserIds = [...new Set([...friendUserIds, ...discoveryAudienceUserIds])]
  const viewerGameIds = viewerInterests.map((interest) => interest.gameId)

  if (broadAudienceUserIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      intents: []
    }
  }

  const intents = await prisma.playIntent.findMany({
    where: {
      userId: {
        in: broadAudienceUserIds
      },
      expiresAt: {
        gt: new Date()
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
      games: {
        include: {
          game: true
        }
      },
      platforms: true
    },
    orderBy: {
      windowStartsAt: 'asc'
    }
  })

  const previews: PlayIntentPreview[] = intents
    .map((intent) => {
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

      const overlappingLibraryGames = intent.user.gameInterests.filter((interest) => viewerGameIds.includes(interest.gameId))
      const selectedGames = intent.games
        .filter((entry) => viewerGameIds.includes(entry.gameId))
        .map((entry) => ({
          id: entry.game.id,
          title: entry.game.title,
          platform: intent.platforms[0]?.platformLabel ?? 'Unknown'
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
        selectionMode: toSelectionMode(intent.selectionMode),
        notifyScope: toNotifyScope(intent.scope),
        platforms: intent.platforms.map((platform) => platform.platformLabel).sort((left, right) => left.localeCompare(right)),
        games: intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? [] : selectedGames,
        note: intent.note,
        availabilityWindow: {
          label: `${intent.user.displayName} is available`,
          startsAt: intent.windowStartsAt.toISOString(),
          endsAt: intent.windowEndsAt.toISOString()
        }
      }
    })
    .filter((preview): preview is PlayIntentPreview => preview !== null)

  return {
    generatedAt: new Date().toISOString(),
    intents: previews
  }
}