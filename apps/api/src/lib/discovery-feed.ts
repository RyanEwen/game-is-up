import type { DiscoveryFeed, DiscoveryGame, DiscoveryGamePlayer, DiscoveryPerson } from '@game-is-up/shared'
import { GameIntentType } from '@prisma/client'
import { getLatestActiveDiscordActivitiesForUsers } from './discord-activity.js'
import { prisma } from './prisma.js'
import { getViewer } from './demo-viewer.js'
import { getSelectedDiscordServerIds } from './discord-servers.js'
import { formatRelativeTime } from './relative-time.js'
import { resolveAvailability } from './availability.js'

const intentOrder: Record<'playing-now' | 'interested' | 'wishlist', number> = {
  'playing-now': 0,
  interested: 1,
  wishlist: 2
}

function toFeedIntent(intentType: GameIntentType): 'wishlist' | 'interested' | 'playing-now' {
  switch (intentType) {
    case GameIntentType.WISHLIST:
      return 'wishlist'
    case GameIntentType.PLAYING_NOW:
      return 'playing-now'
    default:
      return 'interested'
  }
}

export async function buildDiscoveryFeed(viewerId?: string | null): Promise<DiscoveryFeed> {
  const viewer = await getViewer(viewerId)

  if (!viewer) {
    return {
      generatedAt: new Date().toISOString(),
      games: [],
      people: []
    }
  }

  const [viewerInterests, selectedServerIds, friendLinks] = await Promise.all([
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
    getSelectedDiscordServerIds(viewer.id),
    prisma.friend.findMany({
      where: {
        OR: [
          {
            userId: viewer.id
          },
          {
            friendedUserId: viewer.id
          }
        ]
      },
      select: {
        userId: true,
        friendedUserId: true
      }
    })
  ])

  const viewerGameIds = new Set(viewerInterests.map((interest) => interest.gameId))
  const friendIds = new Set(
    friendLinks.map((friendLink) => (friendLink.userId === viewer.id ? friendLink.friendedUserId : friendLink.userId))
  )

  const candidateFilters: Array<Record<string, unknown>> = []

  if (selectedServerIds.length > 0) {
    candidateFilters.push({
      discordServers: {
        some: {
          serverId: {
            in: selectedServerIds
          }
        }
      }
    })
  }

  if (friendIds.size > 0) {
    candidateFilters.push({
      id: {
        in: [...friendIds]
      }
    })
  }

  if (candidateFilters.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      games: [],
      people: []
    }
  }

  const candidates = await prisma.user.findMany({
    where: {
      id: {
        not: viewer.id
      },
      blocksGiven: {
        none: {
          blockedUserId: viewer.id
        }
      },
      blocksReceived: {
        none: {
          userId: viewer.id
        }
      },
      OR: candidateFilters
    },
    include: {
      gameInterests: {
        where: {
          intentType: {
            not: GameIntentType.COMPLETED
          }
        },
        include: {
          game: true,
          platforms: true
        }
      },
      discordServers: {
        where: {
          serverId: {
            in: selectedServerIds
          }
        },
        include: {
          server: true
        }
      }
    }
  })
  const latestActivitiesByUserId = await getLatestActiveDiscordActivitiesForUsers(candidates.map((candidate) => candidate.id))

  const people: DiscoveryPerson[] = candidates
    .map((candidate) => {
      const isFriend = friendIds.has(candidate.id)
      const mutualServers = candidate.discordServers.map((membership) => membership.server.name)

      return {
        id: candidate.id,
        handle: candidate.handle,
        displayName: candidate.displayName,
        avatarUrl: candidate.avatarUrl,
        bio: candidate.bio,
        timezoneLabel: candidate.timezoneLabel,
        usualAvailability: candidate.usualAvailability,
        mutualServers,
        games: candidate.gameInterests
          .map((interest) => ({
            id: interest.game.id,
            title: interest.game.title,
            coverUrl: interest.game.coverUrl,
            platformLabels: interest.platforms.map((platform) => platform.platformLabel),
            intent: toFeedIntent(interest.intentType),
            ...resolveAvailability(interest.availability, candidate.usualAvailability)
          }))
          .sort((left, right) => left.title.localeCompare(right.title)),
        discordActivity: latestActivitiesByUserId.get(candidate.id) ?? null,
        lastActiveLabel: formatRelativeTime(candidate.lastSeenAt),
        isFriend,
        friendEligible: !isFriend,
        contactHint: isFriend
          ? 'Already in your friends list. Discord handoff unlock comes next.'
          : 'Discord handoff unlocks after you add them as a friend.'
      }
    })
    .sort((left, right) => {
      if (left.isFriend !== right.isFriend) {
        return Number(right.isFriend) - Number(left.isFriend)
      }

      if (left.games.length !== right.games.length) {
        return right.games.length - left.games.length
      }

      return left.displayName.localeCompare(right.displayName)
    })

  const gamesById = new Map<string, DiscoveryGame>()

  for (const person of people) {
    for (const game of person.games) {
      const existingGame = gamesById.get(game.id)
      const player: DiscoveryGamePlayer = {
        id: person.id,
        handle: person.handle,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        platformLabels: game.platformLabels,
        intent: game.intent,
        availability: game.availability,
        availabilitySource: game.availabilitySource,
        mutualServers: person.mutualServers,
        isFriend: person.isFriend,
        friendEligible: person.friendEligible,
        contactHint: person.contactHint
      }

      if (existingGame) {
        existingGame.players.push(player)
        existingGame.playerCount = existingGame.players.length
        existingGame.platformLabels = [...new Set([...existingGame.platformLabels, ...game.platformLabels])]
        continue
      }

      gamesById.set(game.id, {
        id: game.id,
        title: game.title,
        coverUrl: game.coverUrl,
        platformLabels: [...new Set(game.platformLabels)],
        sharedWithViewer: viewerGameIds.has(game.id),
        playerCount: 1,
        players: [player]
      })
    }
  }

  const games = [...gamesById.values()]
    .map((game) => ({
      ...game,
      players: [...game.players].sort((left, right) => {
        if (left.isFriend !== right.isFriend) {
          return Number(right.isFriend) - Number(left.isFriend)
        }

        if (left.intent !== right.intent) {
          return intentOrder[left.intent] - intentOrder[right.intent]
        }

        return left.displayName.localeCompare(right.displayName)
      })
    }))
    .sort((left, right) => {
      if (left.sharedWithViewer !== right.sharedWithViewer) {
        return Number(right.sharedWithViewer) - Number(left.sharedWithViewer)
      }

      if (left.playerCount !== right.playerCount) {
        return right.playerCount - left.playerCount
      }

      return left.title.localeCompare(right.title)
    })

  return {
    generatedAt: new Date().toISOString(),
    games,
    people
  }
}