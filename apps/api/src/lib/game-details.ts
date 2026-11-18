/**
 * Per-game detail payload composer.
 *
 * Aggregates the canonical row from the database with classification,
 * gameplay, media, and store-link sections, applying a 30-minute TTL on the
 * RAWG-derived enrichment so detail views stay snappy without thrashing the
 * upstream API. Description copy is truncated and metadata strings are
 * deduplicated before serialization.
 */

import type { GameDetails, GameDetailsGameplay } from '@game-is-up/shared'
import { prisma } from './prisma.js'
import { toClientGameCoverUrl } from './game-media.js'
import { getRawgGameDetails } from './rawg-game-catalog.js'

const steamAppDetailsResponseSchema = {
  parse(input: unknown) {
    return input as Record<
      string,
      {
        success?: boolean
        data?: {
          name?: string
          header_image?: string | null
          background?: string | null
          detailed_description?: string | null
          short_description?: string | null
          website?: string | null
          developers?: string[] | null
          publishers?: string[] | null
          genres?: Array<{ description?: string | null }> | null
          categories?: Array<{ description?: string | null }> | null
          screenshots?: Array<{
            path_full?: string | null
            path_thumbnail?: string | null
          }> | null
          movies?: Array<{
            name?: string | null
            thumbnail?: string | null
            mp4?: { max?: string | null; 480?: string | null } | null
          }> | null
          release_date?: { date?: string | null; coming_soon?: boolean } | null
          metacritic?: { score?: number | null; url?: string | null } | null
        }
      }
    >
  },
}

const detailCacheTtlMs = 30 * 60 * 1000
const gameDetailsCache = new Map<
  string,
  { expiresAt: number; value: GameDetails | null }
>()

const multiplayerMatchers = [
  /multi-player/u,
  /multiplayer/u,
  /online co-op/u,
  /co-op/u,
  /coop/u,
  /local co-op/u,
  /local multiplayer/u,
  /shared\/split screen/u,
  /split screen/u,
  /mmo/u,
  /pvp/u,
]
const singlePlayerMatchers = [/single-player/u, /singleplayer/u]

function truncateText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const trimmed = value?.trim()

  if (!trimmed) {
    return null
  }

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  const sliced = trimmed.slice(0, Math.max(0, maxLength - 3))
  const lastWhitespaceIndex = sliced.lastIndexOf(' ')
  const truncated =
    lastWhitespaceIndex >= Math.floor((maxLength - 3) * 0.6)
      ? sliced.slice(0, lastWhitespaceIndex)
      : sliced

  return `${truncated.trimEnd()}...`
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ]
}

function stripHtml(input: string | null | undefined): string | null {
  if (!input) {
    return null
  }

  const normalized = input
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<li>/giu, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || null
}

function classifyGameplay(labels: string[]): GameDetailsGameplay {
  const evidence = dedupeStrings(labels)
  const normalized = evidence.map((label) => label.toLowerCase())
  const isMultiplayer = normalized.some((label) =>
    multiplayerMatchers.some((matcher) => matcher.test(label)),
  )
  const isSinglePlayer = normalized.some((label) =>
    singlePlayerMatchers.some((matcher) => matcher.test(label)),
  )
  const isCoOp = normalized.some((label) =>
    /co-op|coop|split screen/u.test(label),
  )

  return {
    classification: isMultiplayer
      ? 'multiplayer'
      : isSinglePlayer
        ? 'singleplayer-only'
        : 'unknown',
    isSinglePlayer,
    isMultiplayer,
    isCoOp,
    evidence,
  }
}

function normalizeGameDetails(details: GameDetails | null): GameDetails | null {
  if (!details) {
    return null
  }

  return {
    ...details,
    description: truncateText(details.description, 12000),
    shortDescription: truncateText(details.shortDescription, 1200),
  }
}

function normalizeSteamReleaseDate(
  dateLabel: string | null | undefined,
): string | null {
  if (!dateLabel) {
    return null
  }

  const parsed = Date.parse(dateLabel)

  if (Number.isNaN(parsed)) {
    return null
  }

  return new Date(parsed).toISOString().slice(0, 10)
}

async function fetchSteamGameDetails(
  sourceId: string,
): Promise<GameDetails | null> {
  if (!/^\d+$/.test(sourceId)) {
    return null
  }

  const url = new URL('https://store.steampowered.com/api/appdetails')
  url.searchParams.set('appids', sourceId)
  url.searchParams.set('l', 'en')
  url.searchParams.set(
    'filters',
    'categories,developers,publishers,genres,screenshots,movies,short_description,detailed_description,header_image,website,release_date,metacritic,name',
  )

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Steam appdetails lookup failed: ${response.status} ${response.statusText}`,
    )
  }

  const parsed = steamAppDetailsResponseSchema.parse(await response.json())
  const entry = parsed[sourceId]

  if (!entry?.success || !entry.data?.name) {
    return null
  }

  const categories = dedupeStrings(
    (entry.data.categories ?? []).map((category) => category.description),
  )
  const genres = dedupeStrings(
    (entry.data.genres ?? []).map((genre) => genre.description),
  )
  const coverUrl = toClientGameCoverUrl(entry.data.header_image ?? null)

  return {
    id: `steam:${sourceId}`,
    source: 'steam',
    sourceId,
    title: entry.data.name,
    coverUrl,
    heroImageUrl: coverUrl,
    description: stripHtml(entry.data.detailed_description),
    shortDescription: stripHtml(entry.data.short_description),
    websiteUrl: entry.data.website ?? null,
    releasedAt: normalizeSteamReleaseDate(entry.data.release_date?.date),
    developers: dedupeStrings(entry.data.developers ?? []),
    publishers: dedupeStrings(entry.data.publishers ?? []),
    genres,
    tags: categories,
    platformLabels: ['PC'],
    rating: null,
    reviewCount: null,
    metacritic: entry.data.metacritic?.score ?? null,
    gameplay: classifyGameplay(categories),
    storeLinks: [
      {
        label: 'Steam',
        url: `https://store.steampowered.com/app/${sourceId}`,
      },
    ],
    media: [
      ...(entry.data.screenshots ?? []).slice(0, 8).flatMap((screenshot) =>
        screenshot.path_full
          ? [
              {
                kind: 'image' as const,
                url: screenshot.path_full,
                thumbnailUrl: screenshot.path_thumbnail ?? screenshot.path_full,
                label: entry.data?.name ?? 'Screenshot',
              },
            ]
          : [],
      ),
      ...(entry.data.movies ?? []).slice(0, 2).flatMap((movie) => {
        const videoUrl = movie.mp4?.max ?? movie.mp4?.['480'] ?? null

        return videoUrl
          ? [
              {
                kind: 'video' as const,
                url: videoUrl,
                thumbnailUrl: movie.thumbnail ?? null,
                label: movie.name?.trim() || entry.data?.name || 'Trailer',
              },
            ]
          : []
      }),
    ],
  }
}

async function fetchLocalGameDetails(
  sourceId: string,
): Promise<GameDetails | null> {
  const game = await prisma.game.findUnique({
    where: {
      id: sourceId,
    },
    include: {
      sources: {
        orderBy: [{ canonical: 'desc' }, { source: 'asc' }],
      },
      platforms: {
        orderBy: {
          platformLabel: 'asc',
        },
      },
    },
  })

  if (!game) {
    return null
  }

  const rawgSource = game.sources.find((source) => source.source === 'rawg')

  if (rawgSource) {
    const rawgDetails = await fetchCachedGameDetails(
      `rawg:${rawgSource.externalId}`,
      () => getRawgGameDetails(rawgSource.externalId),
    )

    if (rawgDetails) {
      return {
        ...rawgDetails,
        id: `local:${game.id}`,
        source: 'local',
        sourceId: game.id,
        coverUrl: rawgDetails.coverUrl ?? toClientGameCoverUrl(game.coverUrl),
        heroImageUrl:
          rawgDetails.heroImageUrl ??
          rawgDetails.coverUrl ??
          toClientGameCoverUrl(game.coverUrl),
        title: game.title,
        description: rawgDetails.description ?? game.description,
        platformLabels:
          rawgDetails.platformLabels.length > 0
            ? rawgDetails.platformLabels
            : game.platforms.map((platform) => platform.platformLabel),
      }
    }
  }

  const steamSource = game.sources.find((source) => source.source === 'steam')

  if (steamSource) {
    const steamDetails = await fetchCachedGameDetails(
      `steam:${steamSource.externalId}`,
      () => fetchSteamGameDetails(steamSource.externalId),
    )

    if (steamDetails) {
      return {
        ...steamDetails,
        id: `local:${game.id}`,
        source: 'local',
        sourceId: game.id,
        title: game.title,
        coverUrl: steamDetails.coverUrl ?? toClientGameCoverUrl(game.coverUrl),
        heroImageUrl:
          steamDetails.heroImageUrl ??
          steamDetails.coverUrl ??
          toClientGameCoverUrl(game.coverUrl),
        description: steamDetails.description ?? game.description,
        platformLabels: game.platforms.map(
          (platform) => platform.platformLabel,
        ),
      }
    }
  }

  return {
    id: `local:${game.id}`,
    source: 'local',
    sourceId: game.id,
    title: game.title,
    coverUrl: toClientGameCoverUrl(game.coverUrl),
    heroImageUrl: toClientGameCoverUrl(game.coverUrl),
    description: game.description,
    shortDescription: game.description,
    websiteUrl: null,
    releasedAt: null,
    developers: [],
    publishers: [],
    genres: [],
    tags: [],
    platformLabels: game.platforms.map((platform) => platform.platformLabel),
    rating: null,
    reviewCount: null,
    metacritic: null,
    gameplay: classifyGameplay([]),
    storeLinks: [],
    media: [],
  }
}

async function fetchCachedGameDetails(
  cacheKey: string,
  loader: () => Promise<GameDetails | null>,
) {
  const cached = gameDetailsCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = normalizeGameDetails(await loader())
  gameDetailsCache.set(cacheKey, {
    expiresAt: Date.now() + detailCacheTtlMs,
    value,
  })
  return value
}

export async function getGameDetails(
  source: string,
  sourceId: string,
): Promise<GameDetails | null> {
  if (source === 'rawg') {
    return fetchCachedGameDetails(`rawg:${sourceId}`, () =>
      getRawgGameDetails(sourceId),
    )
  }

  if (source === 'steam') {
    return fetchCachedGameDetails(`steam:${sourceId}`, () =>
      fetchSteamGameDetails(sourceId),
    )
  }

  if (source === 'local') {
    return fetchCachedGameDetails(`local:${sourceId}`, () =>
      fetchLocalGameDetails(sourceId),
    )
  }

  return null
}

export function shouldKeepInMultiplayerResults(
  details: GameDetails | null,
): boolean {
  return (
    details == null || details.gameplay.classification !== 'singleplayer-only'
  )
}
