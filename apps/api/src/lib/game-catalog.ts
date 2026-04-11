import type { CatalogGameMatch, GameSearchResult } from '@game-is-up/shared'
import { prisma } from './prisma.js'
import { isRawgCatalogConfigured, searchRawgGamesByTitle, type ProviderCatalogResult } from './rawg-game-catalog.js'

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return slug || 'game'
}

async function ensureUniqueGameSlug(base: string): Promise<string> {
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = `${base}${suffix}`.slice(0, 56)
    const existing = await prisma.game.findUnique({
      where: {
        slug: candidate
      },
      select: {
        id: true
      }
    })

    if (!existing) {
      return candidate
    }
  }

  return `${base}-${Date.now().toString().slice(-6)}`.slice(0, 56)
}

function dedupePlatformLabels(platformLabels: string[]): string[] {
  return [...new Set(platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
}

function normalizeSearchResultId(source: string, sourceId: string): string {
  return `${source}:${sourceId}`
}

async function findExistingGameByTitle(title: string) {
  const normalizedTitle = title.replace(/\s+/g, ' ').trim()

  return prisma.game.findFirst({
    where: {
      OR: [
        {
          title: {
            equals: normalizedTitle,
            mode: 'insensitive'
          }
        },
        {
          aliases: {
            some: {
              alias: {
                equals: normalizedTitle,
                mode: 'insensitive'
              }
            }
          }
        }
      ]
    }
  })
}

function normalizeLocalSearchResult(game: {
  id: string;
  title: string;
  coverUrl: string | null;
  platforms: { platformLabel: string }[];
}): GameSearchResult {
  return {
    id: normalizeSearchResultId('local', game.id),
    source: 'local',
    sourceId: game.id,
    title: game.title,
    coverUrl: game.coverUrl,
    platformLabels: dedupePlatformLabels(game.platforms.map((platform) => platform.platformLabel))
  }
}

function normalizeProviderSearchResult(result: ProviderCatalogResult): GameSearchResult {
  return {
    id: normalizeSearchResultId(result.source, result.sourceId),
    source: result.source,
    sourceId: result.sourceId,
    title: result.title,
    coverUrl: result.coverUrl,
    platformLabels: dedupePlatformLabels(result.platformLabels)
  }
}

async function syncGamePlatforms(gameId: string, platformLabels: string[]) {
  const dedupedPlatformLabels = dedupePlatformLabels(platformLabels)

  if (dedupedPlatformLabels.length === 0) {
    return
  }

  await prisma.gamePlatform.createMany({
    data: dedupedPlatformLabels.map((platformLabel) => ({
      gameId,
      platformLabel
    })),
    skipDuplicates: true
  })
}

export async function findOrCreateGameByTitle(title: string) {
  const normalizedTitle = title.replace(/\s+/g, ' ').trim()

  const existing = await findExistingGameByTitle(normalizedTitle)

  if (existing) {
    return existing
  }

  const slug = await ensureUniqueGameSlug(slugifyTitle(normalizedTitle))

  return prisma.game.create({
    data: {
      slug,
      title: normalizedTitle
    }
  })
}

export async function findOrCreateGameFromCatalogMatch(catalogMatch: CatalogGameMatch) {
  if (catalogMatch.source === 'local') {
    const localGame = await prisma.game.findUnique({
      where: {
        id: catalogMatch.sourceId
      }
    })

    if (localGame) {
      await syncGamePlatforms(localGame.id, catalogMatch.platformLabels)
      return localGame
    }
  }

  const existingSource = await prisma.gameSource.findUnique({
    where: {
      source_externalId: {
        source: catalogMatch.source,
        externalId: catalogMatch.sourceId
      }
    },
    include: {
      game: true
    }
  })

  if (existingSource) {
    const updatedGame = await prisma.game.update({
      where: {
        id: existingSource.gameId
      },
      data: {
        title: catalogMatch.title,
        coverUrl: catalogMatch.coverUrl ?? existingSource.game.coverUrl,
        description: catalogMatch.description ?? existingSource.game.description
      }
    })

    await syncGamePlatforms(updatedGame.id, catalogMatch.platformLabels)
    return updatedGame
  }

  const existingGame = await findExistingGameByTitle(catalogMatch.title)

  if (existingGame) {
    const updatedGame = await prisma.game.update({
      where: {
        id: existingGame.id
      },
      data: {
        coverUrl: catalogMatch.coverUrl ?? existingGame.coverUrl,
        description: catalogMatch.description ?? existingGame.description,
        sources: {
          create: {
            source: catalogMatch.source,
            externalId: catalogMatch.sourceId,
            canonical: false
          }
        }
      }
    })

    await syncGamePlatforms(updatedGame.id, catalogMatch.platformLabels)
    return updatedGame
  }

  const slug = await ensureUniqueGameSlug(slugifyTitle(catalogMatch.title))
  const createdGame = await prisma.game.create({
    data: {
      slug,
      title: catalogMatch.title,
      coverUrl: catalogMatch.coverUrl ?? null,
      description: catalogMatch.description ?? null,
      sources: {
        create: {
          source: catalogMatch.source,
          externalId: catalogMatch.sourceId,
          canonical: true
        }
      }
    }
  })

  await syncGamePlatforms(createdGame.id, catalogMatch.platformLabels)
  return createdGame
}

export async function searchGamesByTitle(query: string) {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim()

  if (normalizedQuery.length < 2) {
    return []
  }

  const localResults = await prisma.game.findMany({
    where: {
      OR: [
        {
          title: {
            contains: normalizedQuery,
            mode: 'insensitive'
          }
        },
        {
          aliases: {
            some: {
              alias: {
                contains: normalizedQuery,
                mode: 'insensitive'
              }
            }
          }
        }
      ]
    },
    orderBy: {
      title: 'asc'
    },
    take: 8,
    select: {
      id: true,
      title: true,
      coverUrl: true,
      platforms: {
        select: {
          platformLabel: true
        }
      }
    }
  })

  const providerResults = isRawgCatalogConfigured() ? await searchRawgGamesByTitle(normalizedQuery) : []
  const mergedResults = [...providerResults.map(normalizeProviderSearchResult), ...localResults.map(normalizeLocalSearchResult)]
  const dedupedByTitle = new Map<string, GameSearchResult>()

  for (const result of mergedResults) {
    const key = result.title.trim().toLowerCase()

    if (!dedupedByTitle.has(key)) {
      dedupedByTitle.set(key, result)
    }
  }

  return [...dedupedByTitle.values()].slice(0, 8)
}