import type { CatalogGameMatch, GameSearchResult } from '@game-is-up/shared'
import { prisma } from './prisma.js'
import { resolveStoredGameCoverUrl, toClientGameCoverUrl } from './game-media.js'
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

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

export function normalizeGameTitleForCatalogLookup(title: string): string {
  return normalizeTitle(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeGameTitleForMatch(title: string): string {
  return normalizeGameTitleForCatalogLookup(title)
    .replace(/['’`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function titlesConfidentlyMatch(left: string, right: string): boolean {
  return normalizeGameTitleForMatch(left) === normalizeGameTitleForMatch(right)
}

function titlesDifferTextually(left: string, right: string): boolean {
  return normalizeTitle(left).toLowerCase() !== normalizeTitle(right).toLowerCase()
}

function normalizeSearchResultId(source: string, sourceId: string): string {
  return `${source}:${sourceId}`
}

async function findExistingGameByTitle(title: string) {
  const normalizedTitle = normalizeTitle(title)

  const exactMatch = await prisma.game.findFirst({
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

  if (exactMatch) {
    return exactMatch
  }

  return findExistingGameByNormalizedTitle(normalizedTitle)
}

function countCanonicalSources(sources: Array<{ canonical: boolean }>) {
  return sources.filter((source) => source.canonical).length
}

function gameTitleDecorationPenalty(title: string) {
  return (title.match(/[™®©]/g) ?? []).length * 10
    + (title.match(/[^\w\s]/g) ?? []).length
}

async function findExistingGameByNormalizedTitle(title: string) {
  const normalizedMatchTitle = normalizeGameTitleForMatch(title)

  if (!normalizedMatchTitle) {
    return null
  }

  const searchToken = normalizedMatchTitle
    .split(' ')
    .sort((left, right) => right.length - left.length)[0]

  if (!searchToken) {
    return null
  }

  const candidates = await prisma.game.findMany({
    where: {
      OR: [
        {
          title: {
            contains: searchToken,
            mode: 'insensitive'
          }
        },
        {
          aliases: {
            some: {
              alias: {
                contains: searchToken,
                mode: 'insensitive'
              }
            }
          }
        }
      ]
    },
    include: {
      aliases: {
        select: {
          alias: true
        }
      },
      sources: {
        select: {
          canonical: true
        }
      }
    }
  })

  const normalizedMatches = candidates.filter((candidate) => (
    normalizeGameTitleForMatch(candidate.title) === normalizedMatchTitle
    || candidate.aliases.some((aliasEntry) => normalizeGameTitleForMatch(aliasEntry.alias) === normalizedMatchTitle)
  ))

  normalizedMatches.sort((left, right) => {
    const leftTitleMatch = normalizeGameTitleForMatch(left.title) === normalizedMatchTitle
    const rightTitleMatch = normalizeGameTitleForMatch(right.title) === normalizedMatchTitle

    if (leftTitleMatch !== rightTitleMatch) {
      return leftTitleMatch ? -1 : 1
    }

    const canonicalSourceDifference = countCanonicalSources(right.sources) - countCanonicalSources(left.sources)

    if (canonicalSourceDifference !== 0) {
      return canonicalSourceDifference
    }

    const sourceDifference = right.sources.length - left.sources.length

    if (sourceDifference !== 0) {
      return sourceDifference
    }

    const decorationDifference = gameTitleDecorationPenalty(left.title) - gameTitleDecorationPenalty(right.title)

    if (decorationDifference !== 0) {
      return decorationDifference
    }

    return left.title.localeCompare(right.title, undefined, {
      sensitivity: 'base',
      numeric: true
    })
  })

  return normalizedMatches[0] ?? null
}

async function ensureGameAlias(gameId: string, alias: string) {
  const normalizedAlias = normalizeTitle(alias)

  if (!normalizedAlias) {
    return
  }

  await prisma.gameAlias.upsert({
    where: {
      gameId_alias: {
        gameId,
        alias: normalizedAlias
      }
    },
    update: {},
    create: {
      gameId,
      alias: normalizedAlias
    }
  })
}

async function ensureGameSource(gameId: string, source: string, externalId: string, canonical = false) {
  const existingSource = await prisma.gameSource.findUnique({
    where: {
      source_externalId: {
        source,
        externalId
      }
    },
    select: {
      id: true,
      gameId: true
    }
  })

  if (existingSource) {
    return existingSource
  }

  return prisma.gameSource.create({
    data: {
      gameId,
      source,
      externalId,
      canonical
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
    coverUrl: toClientGameCoverUrl(game.coverUrl),
    platformLabels: dedupePlatformLabels(game.platforms.map((platform) => platform.platformLabel))
  }
}

function normalizeProviderSearchResult(result: ProviderCatalogResult): GameSearchResult {
  return {
    id: normalizeSearchResultId(result.source, result.sourceId),
    source: result.source,
    sourceId: result.sourceId,
    title: result.title,
    coverUrl: toClientGameCoverUrl(result.coverUrl),
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

async function createBareGame(title: string) {
  const slug = await ensureUniqueGameSlug(slugifyTitle(title))

  return prisma.game.create({
    data: {
      slug,
      title
    }
  })
}

async function findCatalogBackedMatchByTitle(
  title: string,
  options?: {
    requireNormalizedTitleMatch?: boolean;
  }
): Promise<CatalogGameMatch | null> {
  if (!isRawgCatalogConfigured()) {
    return null
  }

  const providerResults = [...new Map((await Promise.all(
    [...new Set([normalizeTitle(title), normalizeGameTitleForCatalogLookup(title)].filter(Boolean))]
      .map((searchTitle) => searchRawgGamesByTitle(searchTitle))
  ))
    .flat()
    .map((result) => [`${result.source}:${result.sourceId}`, result])
  ).values()]
  const normalizedMatchTitle = normalizeGameTitleForMatch(title)
  const exactNormalizedResult = providerResults.find((result) => titlesConfidentlyMatch(result.title, title))

  const preferredResult = exactNormalizedResult
    ?? providerResults.find((result) => normalizeTitle(result.title).toLowerCase() === title.toLowerCase())
    ?? providerResults[0]

  if (!preferredResult) {
    return null
  }

  if (options?.requireNormalizedTitleMatch && normalizeGameTitleForMatch(preferredResult.title) !== normalizedMatchTitle) {
    return null
  }

  return {
    source: preferredResult.source,
    sourceId: preferredResult.sourceId,
    title: preferredResult.title,
    coverUrl: preferredResult.coverUrl,
    description: preferredResult.description,
    platformLabels: preferredResult.platformLabels
  }
}

export async function findOrCreateGameByTitle(title: string, options?: { searchCatalog?: boolean }) {
  const normalizedTitle = normalizeTitle(title)

  const existing = await findExistingGameByTitle(normalizedTitle)

  if (existing) {
    return existing
  }

  if (options?.searchCatalog) {
    const catalogMatch = await findCatalogBackedMatchByTitle(normalizedTitle)

    if (catalogMatch) {
      return findOrCreateGameFromCatalogMatch(catalogMatch)
    }
  }

  return createBareGame(normalizedTitle)
}

export async function findOrCreateGameFromSteamImport(options: {
  sourceId: string;
  title: string;
  coverUrl: string | null;
  platformLabels: string[];
}) {
  const existingSteamSource = await prisma.gameSource.findUnique({
    where: {
      source_externalId: {
        source: 'steam',
        externalId: options.sourceId
      }
    },
    include: {
      game: true
    }
  })

  if (existingSteamSource) {
    await syncGamePlatforms(existingSteamSource.gameId, options.platformLabels)
    if (titlesDifferTextually(existingSteamSource.game.title, options.title)) {
      await ensureGameAlias(existingSteamSource.gameId, options.title)
    }
    return existingSteamSource.game
  }

  const rawgCatalogMatch = await findCatalogBackedMatchByTitle(options.title, {
    requireNormalizedTitleMatch: true
  })

  if (rawgCatalogMatch) {
    const resolvedGame = await findOrCreateGameFromCatalogMatch(rawgCatalogMatch)

    await Promise.all([
      ensureGameSource(resolvedGame.id, 'steam', options.sourceId, false),
      syncGamePlatforms(resolvedGame.id, [...rawgCatalogMatch.platformLabels, ...options.platformLabels]),
      titlesDifferTextually(resolvedGame.title, options.title) ? ensureGameAlias(resolvedGame.id, options.title) : Promise.resolve()
    ])

    return resolvedGame
  }

  return findOrCreateGameFromCatalogMatch({
    source: 'steam',
    sourceId: options.sourceId,
    title: options.title,
    coverUrl: options.coverUrl,
    platformLabels: options.platformLabels
  })
}

export async function findOrCreateGameFromCatalogMatch(catalogMatch: CatalogGameMatch) {
  const normalizedCoverUrl = resolveStoredGameCoverUrl(catalogMatch.coverUrl)

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
        coverUrl: normalizedCoverUrl ?? existingSource.game.coverUrl,
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
        coverUrl: normalizedCoverUrl ?? existingGame.coverUrl,
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
      coverUrl: normalizedCoverUrl ?? null,
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