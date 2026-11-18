/**
 * Library-page suggestion sources.
 *
 * Surfaces titles the bot has observed the viewer playing on Discord that
 * are not yet in their library, plus a network-trending roll-up of the
 * viewer's friends over a 14-day lookback. Observed games exist only for
 * signed-up users and are keyed by account. Falls back to the seeded sample
 * user's observations outside production when the viewer has none, so dev
 * environments still demonstrate the feature.
 */

import type {
  LibrarySuggestedGame,
  LibraryTrendingGame,
} from '@game-is-up/shared'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { toClientGameCoverUrl } from './game-media.js'

const maxObservedLibrarySuggestions = 8
// The seeded sample viewer (apps/api/prisma/seed.ts) whose observations stand in during development.
const developmentSampleUserHandle = 'technicallyreal'

async function listObservedLibrarySuggestions(
  userId: string,
  excludedGameIds: string[],
) {
  const observations = await prisma.discordObservedGame.findMany({
    where: {
      userId,
      ...(excludedGameIds.length > 0
        ? {
            gameId: {
              notIn: excludedGameIds,
            },
          }
        : {}),
    },
    orderBy: [
      {
        lastObservedAt: 'desc',
      },
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
              platformLabel: 'asc',
            },
            select: {
              platformLabel: true,
            },
          },
        },
      },
      sourceServer: {
        select: {
          name: true,
        },
      },
    },
  })

  return observations
    .filter((observation) => observation.game.platforms.length > 0)
    .slice(0, maxObservedLibrarySuggestions)
    .map((observation) => ({
      gameId: observation.game.id,
      title: observation.game.title,
      coverUrl: toClientGameCoverUrl(observation.game.coverUrl),
      platformLabels: observation.game.platforms.map(
        (platform) => platform.platformLabel,
      ),
      lastObservedAt: observation.lastObservedAt.toISOString(),
      sourceServerName: observation.sourceServer?.name ?? null,
    }))
}

/** The seeded sample viewer's suggestions, for development only; empty when it is not seeded. */
async function listDevelopmentSampleSuggestions(excludedGameIds: string[]) {
  const sampleUser = await prisma.user.findUnique({
    where: { handle: developmentSampleUserHandle },
    select: { id: true },
  })

  if (!sampleUser) {
    return []
  }

  return listObservedLibrarySuggestions(sampleUser.id, excludedGameIds)
}

export async function getObservedLibrarySuggestions(
  userId: string,
  excludedGameIds: string[],
): Promise<LibrarySuggestedGame[]> {
  const personalSuggestions = await listObservedLibrarySuggestions(
    userId,
    excludedGameIds,
  )

  if (personalSuggestions.length > 0 || env.NODE_ENV === 'production') {
    return personalSuggestions
  }

  return listDevelopmentSampleSuggestions(excludedGameIds)
}

const maxTrendingGames = 10
const trendingGameLookbackDays = 14

export async function getNetworkTrendingGames(
  userId: string,
  userLibraryGameIds: string[],
): Promise<LibraryTrendingGame[]> {
  const friendUserIds = await prisma.friend
    .findMany({
      where: { userId },
      select: { friendedUserId: true },
    })
    .then((rows) => rows.map((row) => row.friendedUserId))

  if (friendUserIds.length === 0) {
    return []
  }

  const since = new Date(
    Date.now() - trendingGameLookbackDays * 24 * 60 * 60 * 1000,
  )

  const observations = await prisma.discordObservedGame.findMany({
    where: {
      userId: { in: friendUserIds },
      lastObservedAt: { gte: since },
    },
    select: {
      userId: true,
      gameId: true,
      game: {
        select: {
          id: true,
          title: true,
          coverUrl: true,
          platforms: {
            orderBy: { platformLabel: 'asc' },
            select: { platformLabel: true },
          },
        },
      },
    },
  })

  const playersByGame = new Map<string, Set<string>>()

  for (const obs of observations) {
    if (!playersByGame.has(obs.gameId)) {
      playersByGame.set(obs.gameId, new Set())
    }

    playersByGame.get(obs.gameId)!.add(obs.userId)
  }

  const uniqueGameIds = [...playersByGame.keys()]
  const gameMap = new Map(
    observations
      .filter((obs) => uniqueGameIds.includes(obs.gameId))
      .map((obs) => [obs.gameId, obs.game]),
  )

  const libraryGameIdSet = new Set(userLibraryGameIds)

  return [...playersByGame.entries()]
    .filter(([, players]) => players.size > 0)
    .sort(
      ([, leftPlayers], [, rightPlayers]) =>
        rightPlayers.size - leftPlayers.size,
    )
    .slice(0, maxTrendingGames)
    .map(([gameId, players]) => {
      const game = gameMap.get(gameId)!
      return {
        gameId,
        title: game.title,
        coverUrl: toClientGameCoverUrl(game.coverUrl),
        platformLabels: game.platforms.map((p) => p.platformLabel),
        recentPlayerCount: players.size,
        alreadyInLibrary: libraryGameIdSet.has(gameId),
      }
    })
    .filter((game) => game.platformLabels.length > 0)
}
