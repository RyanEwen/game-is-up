import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpError } from './http-error.js'
import { getApiOrigin } from './origin.js'
import { prisma } from './prisma.js'
import { getRawgGameById } from './rawg-game-catalog.js'

const rawgMediaHostname = 'media.rawg.io'
const rawgMediaProxyPathPrefix = '/api/media/game-cover/'
const steamMediaHostname = 'cdn.cloudflare.steamstatic.com'
const steamMediaProxyPathPrefix = '/api/media/steam-cover/'
const avatarMediaProxyPathPrefix = '/api/media/avatar/'
const avatarCdnHostnames = new Set(['cdn.discordapp.com', 'avatars.akamai.steamstatic.com', 'avatars.steamstatic.com'])
const avatarCacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000
const mediaCacheDirectory = join(tmpdir(), 'game-is-up', 'game-media-cache')
const maxCachedMediaBytes = 10 * 1024 * 1024
const inFlightDownloads = new Map<string, Promise<CachedGameMedia>>()

type CachedGameMedia = {
  body: Buffer;
  contentType: string;
  etag: string;
  lastModified: string | null;
}

type CachedGameMediaMetadata = {
  contentType: string;
  etag: string;
  lastModified: string | null;
  cachedAtMs?: number;
}

function parseRawgMediaUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate)

    if (url.protocol !== 'https:' || url.hostname !== rawgMediaHostname) {
      return null
    }

    return url
  } catch {
    return null
  }
}

function parseSteamMediaUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate)

    if (url.protocol !== 'https:' || url.hostname !== steamMediaHostname) {
      return null
    }

    return url
  } catch {
    return null
  }
}

function buildMediaToken(sourceUrl: string): string {
  return Buffer.from(sourceUrl, 'utf8').toString('base64url')
}

function parseMediaToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    return parseRawgMediaUrl(decoded)?.toString() ?? null
  } catch {
    return null
  }
}

function parseSteamMediaToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    return parseSteamMediaUrl(decoded)?.toString() ?? null
  } catch {
    return null
  }
}

function parseAvatarUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate)

    if (url.protocol !== 'https:' || !avatarCdnHostnames.has(url.hostname)) {
      return null
    }

    return url
  } catch {
    return null
  }
}

function parseAvatarMediaToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    return parseAvatarUrl(decoded)?.toString() ?? null
  } catch {
    return null
  }
}

function getCacheKey(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('hex')
}

function getCachePaths(cacheKey: string) {
  return {
    bodyPath: join(mediaCacheDirectory, `${cacheKey}.bin`),
    metadataPath: join(mediaCacheDirectory, `${cacheKey}.json`)
  }
}

async function readCachedGameMedia(cacheKey: string, maxAgeMs?: number): Promise<CachedGameMedia | null> {
  const { bodyPath, metadataPath } = getCachePaths(cacheKey)

  try {
    const [body, metadataJson] = await Promise.all([readFile(bodyPath), readFile(metadataPath, 'utf8')])
    const metadata = JSON.parse(metadataJson) as CachedGameMediaMetadata

    if (!metadata.contentType || !metadata.etag) {
      return null
    }

    if (maxAgeMs !== undefined && metadata.cachedAtMs !== undefined && Date.now() - metadata.cachedAtMs > maxAgeMs) {
      return null
    }

    return {
      body,
      contentType: metadata.contentType,
      etag: metadata.etag,
      lastModified: metadata.lastModified ?? null
    }
  } catch {
    return null
  }
}

async function writeCachedGameMedia(cacheKey: string, media: CachedGameMedia): Promise<void> {
  await mkdir(mediaCacheDirectory, { recursive: true })

  const { bodyPath, metadataPath } = getCachePaths(cacheKey)
  const temporaryBodyPath = `${bodyPath}.tmp`
  const temporaryMetadataPath = `${metadataPath}.tmp`
  const metadata: CachedGameMediaMetadata = {
    contentType: media.contentType,
    etag: media.etag,
    lastModified: media.lastModified,
    cachedAtMs: Date.now()
  }

  await Promise.all([
    writeFile(temporaryBodyPath, media.body),
    writeFile(temporaryMetadataPath, JSON.stringify(metadata))
  ])

  await Promise.all([
    rename(temporaryBodyPath, bodyPath),
    rename(temporaryMetadataPath, metadataPath)
  ])
}

async function downloadAndCacheMedia(sourceUrl: string, cacheKey: string, sourceLabel: string): Promise<CachedGameMedia> {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'image/*'
    }
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new HttpError(404, `${sourceLabel} media not found.`)
    }

    throw new HttpError(502, `${sourceLabel} media fetch failed: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''

  if (!contentType.startsWith('image/')) {
    throw new Error(`${sourceLabel} media fetch returned unexpected content type: ${contentType || 'unknown'}`)
  }

  const announcedLength = Number(response.headers.get('content-length') ?? '0')

  if (Number.isFinite(announcedLength) && announcedLength > maxCachedMediaBytes) {
    throw new Error(`${sourceLabel} media exceeds cache size limit: ${announcedLength} bytes`)
  }

  const body = Buffer.from(await response.arrayBuffer())

  if (body.length > maxCachedMediaBytes) {
    throw new Error(`${sourceLabel} media exceeds cache size limit after download: ${body.length} bytes`)
  }

  const media: CachedGameMedia = {
    body,
    contentType,
    etag: createHash('sha256').update(body).digest('hex'),
    lastModified: response.headers.get('last-modified')
  }

  await writeCachedGameMedia(cacheKey, media)
  return media
}

async function refreshStoredRawgGameCoverUrl(sourceUrl: string): Promise<string | null> {
  const matchingGames = await prisma.game.findMany({
    where: {
      coverUrl: sourceUrl,
      sources: {
        some: {
          source: 'rawg'
        }
      }
    },
    select: {
      id: true,
      sources: {
        where: {
          source: 'rawg'
        },
        select: {
          id: true,
          externalId: true
        }
      }
    }
  })

  if (matchingGames.length === 0) {
    return null
  }

  const refreshedCoverBySourceId = new Map<string, string | null>()
  const refreshedCoverUrls = new Set<string>()

  for (const game of matchingGames) {
    const rawgSource = game.sources[0]

    if (!rawgSource) {
      continue
    }

    if (!refreshedCoverBySourceId.has(rawgSource.externalId)) {
      const refreshedGame = await getRawgGameById(rawgSource.externalId)
      refreshedCoverBySourceId.set(rawgSource.externalId, resolveStoredGameCoverUrl(refreshedGame?.coverUrl) ?? null)
    }

    const refreshedCoverUrl = refreshedCoverBySourceId.get(rawgSource.externalId) ?? null

    await prisma.game.update({
      where: {
        id: game.id
      },
      data: {
        coverUrl: refreshedCoverUrl
      }
    })

    await prisma.gameSource.update({
      where: {
        id: rawgSource.id
      },
      data: {
        syncedAt: new Date()
      }
    })

    if (refreshedCoverUrl && refreshedCoverUrl !== sourceUrl) {
      refreshedCoverUrls.add(refreshedCoverUrl)
    }
  }

  if (refreshedCoverUrls.size !== 1) {
    return null
  }

  const [refreshedCoverUrl] = refreshedCoverUrls
  return refreshedCoverUrl ?? null
}

async function downloadAndCacheRawgMedia(sourceUrl: string): Promise<CachedGameMedia> {
  const cacheKey = getCacheKey(sourceUrl)

  try {
    return await downloadAndCacheMedia(sourceUrl, cacheKey, 'RAWG')
  } catch (error) {
    if (!(error instanceof HttpError) || error.statusCode !== 404) {
      throw error
    }

    let refreshedSourceUrl: string | null = null

    try {
      refreshedSourceUrl = await refreshStoredRawgGameCoverUrl(sourceUrl)
    } catch {
      refreshedSourceUrl = null
    }

    if (!refreshedSourceUrl || refreshedSourceUrl === sourceUrl) {
      throw error
    }

    const refreshedCacheKey = getCacheKey(refreshedSourceUrl)
    const cachedRefreshedMedia = await readCachedGameMedia(refreshedCacheKey)

    if (cachedRefreshedMedia) {
      return cachedRefreshedMedia
    }

    return downloadAndCacheMedia(refreshedSourceUrl, refreshedCacheKey, 'RAWG')
  }
}

export function toClientGameCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) {
    return null
  }

  const sourceUrl = resolveStoredGameCoverUrl(coverUrl)

  if (!sourceUrl) {
    return null
  }

  if (parseRawgMediaUrl(sourceUrl)) {
    return `${getApiOrigin()}${rawgMediaProxyPathPrefix}${buildMediaToken(sourceUrl)}`
  }

  if (parseSteamMediaUrl(sourceUrl)) {
    return `${getApiOrigin()}${steamMediaProxyPathPrefix}${buildMediaToken(sourceUrl)}`
  }

  return sourceUrl
}

export function resolveStoredGameCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) {
    return null
  }

  try {
    const url = new URL(coverUrl)

    if (url.pathname.startsWith(rawgMediaProxyPathPrefix)) {
      const token = url.pathname.slice(rawgMediaProxyPathPrefix.length)
      return parseMediaToken(token) ?? coverUrl
    }

    if (url.pathname.startsWith(steamMediaProxyPathPrefix)) {
      const token = url.pathname.slice(steamMediaProxyPathPrefix.length)
      return parseSteamMediaToken(token) ?? coverUrl
    }

    return coverUrl
  } catch {
    return coverUrl
  }
}

export async function getCachedRawgGameMedia(token: string): Promise<CachedGameMedia | null> {
  const sourceUrl = parseMediaToken(token)

  if (!sourceUrl) {
    return null
  }

  const cacheKey = getCacheKey(sourceUrl)
  const cached = await readCachedGameMedia(cacheKey)

  if (cached) {
    return cached
  }

  const existingDownload = inFlightDownloads.get(cacheKey)

  if (existingDownload) {
    return existingDownload
  }

  const pendingDownload = downloadAndCacheRawgMedia(sourceUrl).finally(() => {
    inFlightDownloads.delete(cacheKey)
  })

  inFlightDownloads.set(cacheKey, pendingDownload)
  return pendingDownload
}

export async function getCachedSteamGameMedia(token: string): Promise<CachedGameMedia | null> {
  const sourceUrl = parseSteamMediaToken(token)

  if (!sourceUrl) {
    return null
  }

  const cacheKey = getCacheKey(sourceUrl)
  const cached = await readCachedGameMedia(cacheKey)

  if (cached) {
    return cached
  }

  const existingDownload = inFlightDownloads.get(cacheKey)

  if (existingDownload) {
    return existingDownload
  }

  const pendingDownload = downloadAndCacheMedia(sourceUrl, cacheKey, 'Steam').finally(() => {
    inFlightDownloads.delete(cacheKey)
  })

  inFlightDownloads.set(cacheKey, pendingDownload)
  return pendingDownload
}

export function toClientAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) {
    return null
  }

  if (!parseAvatarUrl(avatarUrl)) {
    return avatarUrl
  }

  return `${getApiOrigin()}${avatarMediaProxyPathPrefix}${buildMediaToken(avatarUrl)}`
}

export async function getCachedAvatarMedia(token: string): Promise<CachedGameMedia | null> {
  const sourceUrl = parseAvatarMediaToken(token)

  if (!sourceUrl) {
    return null
  }

  const cacheKey = getCacheKey(sourceUrl)
  const cached = await readCachedGameMedia(cacheKey, avatarCacheMaxAgeMs)

  if (cached) {
    return cached
  }

  const existingDownload = inFlightDownloads.get(cacheKey)

  if (existingDownload) {
    return existingDownload
  }

  const pendingDownload = downloadAndCacheMedia(sourceUrl, cacheKey, 'Avatar').finally(() => {
    inFlightDownloads.delete(cacheKey)
  })

  inFlightDownloads.set(cacheKey, pendingDownload)
  return pendingDownload
}