import { z } from 'zod'
import { env } from './env.js'

const rawgSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      background_image: z.string().url().nullable().optional(),
      description_raw: z.string().nullable().optional(),
      platforms: z
        .array(
          z.object({
            platform: z.object({
              name: z.string().min(1)
            })
          })
        )
        .nullable()
        .optional()
    })
  )
})

export type ProviderCatalogResult = {
  source: string;
  sourceId: string;
  title: string;
  coverUrl: string | null;
  description: string | null;
  platformLabels: string[];
};

function normalizePlatformLabel(platformName: string): string | null {
  const normalized = platformName.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (
    normalized.includes('xbox')
  ) {
    return 'Xbox'
  }

  if (normalized.includes('playstation') || normalized === 'ps vita' || normalized === 'psp') {
    return 'PlayStation'
  }

  if (normalized.includes('nintendo') || normalized.includes('switch') || normalized.includes('wii')) {
    return 'Switch'
  }

  if (normalized.includes('android') || normalized.includes('ios') || normalized.includes('iphone') || normalized.includes('ipad')) {
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

export function isRawgCatalogConfigured(): boolean {
  return Boolean(env.RAWG_API_KEY)
}

export async function searchRawgGamesByTitle(query: string): Promise<ProviderCatalogResult[]> {
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
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`RAWG search failed: ${response.status} ${response.statusText}`)
  }

  const responseJson = await response.json()
  const parsed = rawgSearchResponseSchema.parse(responseJson)

  return parsed.results.map((result) => ({
    source: 'rawg',
    sourceId: result.id.toString(),
    title: result.name,
    coverUrl: result.background_image ?? null,
    description: result.description_raw ?? null,
    platformLabels: dedupePlatformLabels((result.platforms ?? []).map(({ platform }) => normalizePlatformLabel(platform.name)).filter((label): label is string => Boolean(label)))
  }))
}