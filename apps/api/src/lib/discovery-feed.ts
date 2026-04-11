import type { DiscoveryFeed, DiscoveryGame, DiscoveryGamePlayer, DiscoveryPerson } from '@game-is-up/shared'
import { GameIntentType } from '@prisma/client'
import { getLatestActiveDiscordActivitiesForUsers } from './discord-activity.js'
import { prisma } from './prisma.js'
import { getViewer } from './demo-viewer.js'
import { getSelectedDiscordServerIds } from './discord-servers.js'
import { toClientGameCoverUrl } from './game-media.js'
import { formatRelativeTime } from './relative-time.js'
import { resolveAvailability } from './availability.js'
import { formatTimezoneLabel } from './timezone-label.js'

const intentOrder: Record<'playing-now' | 'interested' | 'wishlist', number> = {
  'playing-now': 0,
  interested: 1,
  wishlist: 2
}

function normalizeGameTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase()
}

function mergePlatformLabels(...platformGroups: string[][]): string[] {
  return [...new Set(platformGroups.flatMap((platforms) => platforms))].sort((left, right) => left.localeCompare(right))
}

function pickPreferredIntent(
  currentIntent: 'playing-now' | 'interested' | 'wishlist',
  nextIntent: 'playing-now' | 'interested' | 'wishlist'
) {
  return intentOrder[currentIntent] <= intentOrder[nextIntent] ? currentIntent : nextIntent
}

function pickPreferredAvailability(
  currentGame: DiscoveryPerson['games'][number],
  nextGame: DiscoveryPerson['games'][number]
) {
  if (!currentGame.availability) {
    return {
      availability: nextGame.availability,
      availabilitySource: nextGame.availabilitySource
    }
  }

  if (!nextGame.availability) {
    return {
      availability: currentGame.availability,
      availabilitySource: currentGame.availabilitySource
    }
  }

  if (currentGame.availabilitySource === 'game-specific') {
    return {
      availability: currentGame.availability,
      availabilitySource: currentGame.availabilitySource
    }
  }

  if (nextGame.availabilitySource === 'game-specific') {
    return {
      availability: nextGame.availability,
      availabilitySource: nextGame.availabilitySource
    }
  }

  return {
    availability: currentGame.availability,
    availabilitySource: currentGame.availabilitySource
  }
}

function mergeDiscoveryPersonGame(
  currentGame: DiscoveryPerson['games'][number],
  nextGame: DiscoveryPerson['games'][number]
): DiscoveryPerson['games'][number] {
  const preferredAvailability = pickPreferredAvailability(currentGame, nextGame)

  return {
    ...currentGame,
    coverUrl: currentGame.coverUrl ?? nextGame.coverUrl,
    platformLabels: mergePlatformLabels(currentGame.platformLabels, nextGame.platformLabels),
    intent: pickPreferredIntent(currentGame.intent, nextGame.intent),
    availability: preferredAvailability.availability,
    availabilitySource: preferredAvailability.availabilitySource
  }
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
        game: {
          select: {
            title: true
          }
        }
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

  const viewerGameTitleKeys = new Set(viewerInterests.map((interest) => normalizeGameTitle(interest.game.title)))
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
      const gamesByTitleKey = new Map<string, DiscoveryPerson['games'][number]>()

      for (const interest of candidate.gameInterests) {
        const nextGame: DiscoveryPerson['games'][number] = {
          id: interest.game.id,
          title: interest.game.title,
          coverUrl: toClientGameCoverUrl(interest.game.coverUrl),
          platformLabels: interest.platforms.map((platform) => platform.platformLabel),
          intent: toFeedIntent(interest.intentType),
          ...resolveAvailability(interest.availability, candidate.usualAvailability)
        }
        const titleKey = normalizeGameTitle(nextGame.title)
        const existingGame = gamesByTitleKey.get(titleKey)

        if (existingGame) {
          gamesByTitleKey.set(titleKey, mergeDiscoveryPersonGame(existingGame, nextGame))
          continue
        }

        gamesByTitleKey.set(titleKey, nextGame)
      }

      return {
        id: candidate.id,
        handle: candidate.handle,
        displayName: candidate.displayName,
        avatarUrl: candidate.avatarUrl,
        bio: candidate.bio,
        timezoneId: candidate.timezoneId,
        timezoneLabel: formatTimezoneLabel(candidate.timezoneId),
        usualAvailability: candidate.usualAvailability,
        mutualServers: [...mutualServers].sort((left, right) => left.localeCompare(right)),
        games: [...gamesByTitleKey.values()]
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

  const gamesByTitleKey = new Map<string, DiscoveryGame>()

  for (const person of people) {
    for (const game of person.games) {
      const titleKey = normalizeGameTitle(game.title)
      const existingGame = gamesByTitleKey.get(titleKey)
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
        existingGame.platformLabels = mergePlatformLabels(existingGame.platformLabels, game.platformLabels)
        existingGame.sharedWithViewer = existingGame.sharedWithViewer || viewerGameTitleKeys.has(titleKey)
        existingGame.coverUrl = existingGame.coverUrl ?? game.coverUrl
        continue
      }

      gamesByTitleKey.set(titleKey, {
        id: game.id,
        title: game.title,
        coverUrl: game.coverUrl,
        platformLabels: mergePlatformLabels(game.platformLabels),
        sharedWithViewer: viewerGameTitleKeys.has(titleKey),
        playerCount: 1,
        players: [player]
      })
    }
  }

  const games = [...gamesByTitleKey.values()]
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