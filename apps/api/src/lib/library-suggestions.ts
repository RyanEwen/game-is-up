import type { LibrarySuggestedGame, LibraryTrendingGame } from '@game-is-up/shared'
import { AuthProvider } from '@prisma/client'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { toClientGameCoverUrl } from './game-media.js'

const maxObservedLibrarySuggestions = 8
const developmentSampleDiscordUserId = 'discord-alex'

async function listObservedLibrarySuggestions(discordUserId: string, excludedGameIds: string[]) {
  const observations = await prisma.discordObservedGame.findMany({
    where: {
      discordUserId,
      ...(excludedGameIds.length > 0
        ? {
            gameId: {
              notIn: excludedGameIds
            }
          }
        : {})
    },
    orderBy: [
      {
        lastObservedAt: 'desc'
      }
    ],
    take: maxObservedLibrarySuggestions * 3,
    include: {
      game: {
        select: {
          id: true,
          title: true,
          coverUrl: true,
          platforms: {
            orderBy: {
              platformLabel: 'asc'
            },
            select: {
              platformLabel: true
            }
          }
        }
      },
      sourceServer: {
        select: {
          name: true
        }
      }
    }
  })

  return observations
    .filter((observation) => observation.game.platforms.length > 0)
    .slice(0, maxObservedLibrarySuggestions)
    .map((observation) => ({
      gameId: observation.game.id,
      title: observation.game.title,
      coverUrl: toClientGameCoverUrl(observation.game.coverUrl),
      platformLabels: observation.game.platforms.map((platform) => platform.platformLabel),
      lastObservedAt: observation.lastObservedAt.toISOString(),
      sourceServerName: observation.sourceServer?.name ?? null
    }))
}

export async function getObservedLibrarySuggestions(userId: string, excludedGameIds: string[]): Promise<LibrarySuggestedGame[]> {
  const discordIdentity = await prisma.userIdentity.findFirst({
    where: {
      userId,
      provider: AuthProvider.DISCORD
    },
    select: {
      providerUserId: true
    }
  })

  if (!discordIdentity) {
    return env.NODE_ENV === 'production'
      ? []
      : listObservedLibrarySuggestions(developmentSampleDiscordUserId, excludedGameIds)
  }

  const personalSuggestions = await listObservedLibrarySuggestions(discordIdentity.providerUserId, excludedGameIds)

  if (personalSuggestions.length > 0 || env.NODE_ENV === 'production') {
    return personalSuggestions
  }

  return listObservedLibrarySuggestions(developmentSampleDiscordUserId, excludedGameIds)
}

const maxTrendingGames = 10
const trendingGameLookbackDays = 14

export async function getNetworkTrendingGames(userId: string, userLibraryGameIds: string[]): Promise<LibraryTrendingGame[]> {
  const friendUserIds = await prisma.friend.findMany({
    where: { userId },
    select: { friendedUserId: true }
  }).then((rows) => rows.map((row) => row.friendedUserId))

  if (friendUserIds.length === 0) {
    return []
  }

  const since = new Date(Date.now() - trendingGameLookbackDays * 24 * 60 * 60 * 1000)

  const friendDiscordIds = await prisma.userIdentity.findMany({
    where: {
      provider: AuthProvider.DISCORD,
      userId: { in: friendUserIds }
    },
    select: { providerUserId: true }
  }).then((rows) => rows.map((row) => row.providerUserId))

  if (friendDiscordIds.length === 0) {
    return []
  }

  const observations = await prisma.discordObservedGame.findMany({
    where: {
      discordUserId: { in: friendDiscordIds },
      lastObservedAt: { gte: since }
    },
    select: {
      discordUserId: true,
      gameId: true,
      game: {
        select: {
          id: true,
          title: true,
          coverUrl: true,
          platforms: {
            orderBy: { platformLabel: 'asc' },
            select: { platformLabel: true }
          }
        }
      }
    }
  })

  const playersByGame = new Map<string, Set<string>>()

  for (const obs of observations) {
    if (!playersByGame.has(obs.gameId)) {
      playersByGame.set(obs.gameId, new Set())
    }

    playersByGame.get(obs.gameId)!.add(obs.discordUserId)
  }

  const uniqueGameIds = [...playersByGame.keys()]
  const gameMap = new Map(
    observations
      .filter((obs) => uniqueGameIds.includes(obs.gameId))
      .map((obs) => [obs.gameId, obs.game])
  )

  const libraryGameIdSet = new Set(userLibraryGameIds)

  return [...playersByGame.entries()]
    .filter(([, players]) => players.size > 0)
    .sort(([, leftPlayers], [, rightPlayers]) => rightPlayers.size - leftPlayers.size)
    .slice(0, maxTrendingGames)
    .map(([gameId, players]) => {
      const game = gameMap.get(gameId)!
      return {
        gameId,
        title: game.title,
        coverUrl: toClientGameCoverUrl(game.coverUrl),
        platformLabels: game.platforms.map((p) => p.platformLabel),
        recentPlayerCount: players.size,
        alreadyInLibrary: libraryGameIdSet.has(gameId)
      }
    })
    .filter((game) => game.platformLabels.length > 0)
}