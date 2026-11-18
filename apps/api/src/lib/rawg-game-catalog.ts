/**
 * RAWG catalog provider implementation.
 *
 * Owns the typed wrapper over RAWG's search and game-detail endpoints,
 * including the response zod schemas, gameplay classification heuristics
 * (single-player only / multiplayer / co-op based on tags + categories),
 * description HTML stripping, and platform-label normalization. Other modules
 * call into here when they need fresh catalog data; the persistence layer
 * lives in `game-catalog.ts`.
 */

import type { GameDetails, GameDetailsGameplay } from '@game-is-up/shared'
import { z } from 'zod'
import { env } from './env.js'

const rawgGameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  background_image: z.string().url().nullable().optional(),
  background_image_additional: z.string().url().nullable().optional(),
  description_raw: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  website: z.string().trim().nullable().optional(),
  released: z.string().date().nullable().optional(),
  metacritic: z.number().int().min(0).max(100).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  ratings_count: z.number().int().nonnegative().nullable().optional(),
  developers: z
    .array(z.object({ name: z.string().min(1) }))
    .nullable()
    .optional(),
  publishers: z
    .array(z.object({ name: z.string().min(1) }))
    .nullable()
    .optional(),
  genres: z
    .array(z.object({ name: z.string().min(1) }))
    .nullable()
    .optional(),
  tags: z
    .array(z.object({ name: z.string().min(1) }))
    .nullable()
    .optional(),
  stores: z
    .array(
      z.object({
        store: z.object({ name: z.string().min(1) }),
        url_en: z.string().trim().nullable().optional(),
        url: z.string().trim().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  platforms: z
    .array(
      z.object({
        platform: z.object({
          name: z.string().min(1),
        }),
      }),
    )
    .nullable()
    .optional(),
})

const rawgSearchResponseSchema = z.object({
  results: z.array(rawgGameSchema),
})

const rawgScreenshotSchema = z.object({
  id: z.number().int().nonnegative(),
  image: z.string().url(),
})

const rawgScreenshotsResponseSchema = z.object({
  results: z.array(rawgScreenshotSchema),
})

const rawgMovieSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  preview: z.string().url().nullable().optional(),
  data: z
    .object({
      max: z.string().url().nullable().optional(),
      480: z.string().url().nullable().optional(),
    })
    .partial()
    .nullable()
    .optional(),
})

const rawgMoviesResponseSchema = z.object({
  results: z.array(rawgMovieSchema),
})

export type ProviderCatalogResult = {
  source: string
  sourceId: string
  title: string
  coverUrl: string | null
  description: string | null
  platformLabels: string[]
}

const multiplayerTagMatchers = [
  /multiplayer/u,
  /massively multiplayer/u,
  /online co-op/u,
  /online pvp/u,
  /co-op/u,
  /coop/u,
  /local multiplayer/u,
  /split screen/u,
]
const singlePlayerTagMatchers = [/singleplayer/u, /single-player/u]

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ]
}

function toAbsoluteUrlOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

function stripHtml(input: string | null | undefined): string | null {
  if (!input) {
    return null
  }

  const normalized = input
    .replace(/<br\s*\/?/giu, '\n')
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
  const normalizedEvidence = evidence.map((label) => label.toLowerCase())
  const isMultiplayer = normalizedEvidence.some((label) =>
    multiplayerTagMatchers.some((pattern) => pattern.test(label)),
  )
  const isCoOp = normalizedEvidence.some((label) =>
    /co-op|coop|split screen/u.test(label),
  )
  const isSinglePlayer = normalizedEvidence.some((label) =>
    singlePlayerTagMatchers.some((pattern) => pattern.test(label)),
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

function normalizePlatformLabel(platformName: string): string | null {
  const normalized = platformName.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized.includes('xbox')) {
    return 'Xbox'
  }

  if (
    normalized.includes('playstation') ||
    normalized === 'ps vita' ||
    normalized === 'psp'
  ) {
    return 'PlayStation'
  }

  if (
    normalized.includes('nintendo') ||
    normalized.includes('switch') ||
    normalized.includes('wii')
  ) {
    return 'Switch'
  }

  if (
    normalized.includes('android') ||
    normalized.includes('ios') ||
    normalized.includes('iphone') ||
    normalized.includes('ipad')
  ) {
    return 'Mobile'
  }

  if (normalized.includes('linux')) {
    return 'Linux'
  }

  if (normalized.includes('mac')) {
    return 'macOS'
  }

  if (
    normalized.includes('pc') ||
    normalized.includes('windows') ||
    normalized.includes('steam') ||
    normalized.includes('dos')
  ) {
    return 'PC'
  }

  return platformName.trim()
}

function dedupePlatformLabels(platformLabels: string[]): string[] {
  return [...new Set(platformLabels.filter(Boolean))]
}

function toProviderCatalogResult(
  result: z.infer<typeof rawgGameSchema>,
): ProviderCatalogResult {
  return {
    source: 'rawg',
    sourceId: result.id.toString(),
    title: result.name,
    coverUrl: result.background_image ?? null,
    description: result.description_raw ?? null,
    platformLabels: dedupePlatformLabels(
      (result.platforms ?? [])
        .map(({ platform }) => normalizePlatformLabel(platform.name))
        .filter((label): label is string => Boolean(label)),
    ),
  }
}

export function isRawgCatalogConfigured(): boolean {
  return Boolean(env.RAWG_API_KEY)
}

export async function searchRawgGamesByTitle(
  query: string,
): Promise<ProviderCatalogResult[]> {
  if (!env.RAWG_API_KEY) {
    return []
  }

  const url = new URL('https://api.rawg.io/api/games')
  url.searchParams.set('key', env.RAWG_API_KEY)
  url.searchParams.set('search', query)
  url.searchParams.set('search_precise', 'true')
  url.searchParams.set('page_size', '8')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(
      `RAWG search failed: ${response.status} ${response.statusText}`,
    )
  }

  const responseJson = await response.json()
  const parsed = rawgSearchResponseSchema.parse(responseJson)

  return parsed.results.map(toProviderCatalogResult)
}

export async function getRawgGameById(
  sourceId: string,
): Promise<ProviderCatalogResult | null> {
  if (!env.RAWG_API_KEY || !/^\d+$/.test(sourceId)) {
    return null
  }

  const url = new URL(`https://api.rawg.io/api/games/${sourceId}`)
  url.searchParams.set('key', env.RAWG_API_KEY)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `RAWG game lookup failed: ${response.status} ${response.statusText}`,
    )
  }

  const responseJson = await response.json()
  const parsed = rawgGameSchema.parse(responseJson)

  return toProviderCatalogResult(parsed)
}

export async function getRawgGameDetails(
  sourceId: string,
): Promise<GameDetails | null> {
  if (!env.RAWG_API_KEY || !/^\d+$/.test(sourceId)) {
    return null
  }

  const detailUrl = new URL(`https://api.rawg.io/api/games/${sourceId}`)
  detailUrl.searchParams.set('key', env.RAWG_API_KEY)
  const screenshotsUrl = new URL(
    `https://api.rawg.io/api/games/${sourceId}/screenshots`,
  )
  screenshotsUrl.searchParams.set('key', env.RAWG_API_KEY)
  const moviesUrl = new URL(`https://api.rawg.io/api/games/${sourceId}/movies`)
  moviesUrl.searchParams.set('key', env.RAWG_API_KEY)

  const [detailResponse, screenshotsResponse, moviesResponse] =
    await Promise.all([
      fetch(detailUrl, {
        headers: {
          Accept: 'application/json',
        },
      }),
      fetch(screenshotsUrl, {
        headers: {
          Accept: 'application/json',
        },
      }),
      fetch(moviesUrl, {
        headers: {
          Accept: 'application/json',
        },
      }),
    ])

  if (detailResponse.status === 404) {
    return null
  }

  if (!detailResponse.ok) {
    throw new Error(
      `RAWG game detail lookup failed: ${detailResponse.status} ${detailResponse.statusText}`,
    )
  }

  const detailJson = await detailResponse.json()
  const detail = rawgGameSchema.parse(detailJson)
  const screenshots = screenshotsResponse.ok
    ? rawgScreenshotsResponseSchema.parse(await screenshotsResponse.json())
        .results
    : []
  const movies = moviesResponse.ok
    ? rawgMoviesResponseSchema.parse(await moviesResponse.json()).results
    : []
  const tagNames = dedupeStrings([
    ...(detail.tags ?? []).map((tag) => tag.name),
    ...(detail.genres ?? []).map((genre) => genre.name),
  ])

  return {
    id: `rawg:${detail.id}`,
    source: 'rawg',
    sourceId: detail.id.toString(),
    title: detail.name,
    coverUrl: detail.background_image ?? null,
    heroImageUrl:
      detail.background_image_additional ?? detail.background_image ?? null,
    description: detail.description_raw ?? stripHtml(detail.description),
    shortDescription:
      detail.description_raw?.split(/\n+/u)[0]?.trim() ||
      stripHtml(detail.description),
    websiteUrl: toAbsoluteUrlOrNull(detail.website),
    releasedAt: detail.released ?? null,
    developers: dedupeStrings(
      (detail.developers ?? []).map((developer) => developer.name),
    ),
    publishers: dedupeStrings(
      (detail.publishers ?? []).map((publisher) => publisher.name),
    ),
    genres: dedupeStrings((detail.genres ?? []).map((genre) => genre.name)),
    tags: dedupeStrings((detail.tags ?? []).map((tag) => tag.name)),
    platformLabels: dedupePlatformLabels(
      (detail.platforms ?? [])
        .map(({ platform }) => normalizePlatformLabel(platform.name))
        .filter((label): label is string => Boolean(label)),
    ),
    rating: detail.rating ?? null,
    reviewCount: detail.ratings_count ?? null,
    metacritic: detail.metacritic ?? null,
    gameplay: classifyGameplay(tagNames),
    storeLinks: (detail.stores ?? []).flatMap((store) => {
      const url =
        toAbsoluteUrlOrNull(store.url_en) ?? toAbsoluteUrlOrNull(store.url)

      return url
        ? [
            {
              label: store.store.name,
              url,
            },
          ]
        : []
    }),
    media: [
      ...screenshots.slice(0, 8).map((screenshot) => ({
        kind: 'image' as const,
        url: screenshot.image,
        thumbnailUrl: screenshot.image,
        label: detail.name,
      })),
      ...movies.slice(0, 2).flatMap((movie) => {
        const url = movie.data?.max ?? movie.data?.['480'] ?? null

        return url
          ? [
              {
                kind: 'video' as const,
                url,
                thumbnailUrl: movie.preview ?? null,
                label: movie.name,
              },
            ]
          : []
      }),
    ],
  }
}
