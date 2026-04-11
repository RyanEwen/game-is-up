import type { LibrarySuggestedGame } from '@game-is-up/shared'
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