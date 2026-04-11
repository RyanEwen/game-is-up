import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getApiOrigin } from './origin.js'

const rawgMediaHostname = 'media.rawg.io'
const mediaProxyPathPrefix = '/api/media/game-cover/'
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

function getCacheKey(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('hex')
}

function getCachePaths(cacheKey: string) {
  return {
    bodyPath: join(mediaCacheDirectory, `${cacheKey}.bin`),
    metadataPath: join(mediaCacheDirectory, `${cacheKey}.json`)
  }
}

async function readCachedGameMedia(cacheKey: string): Promise<CachedGameMedia | null> {
  const { bodyPath, metadataPath } = getCachePaths(cacheKey)

  try {
    const [body, metadataJson] = await Promise.all([readFile(bodyPath), readFile(metadataPath, 'utf8')])
    const metadata = JSON.parse(metadataJson) as CachedGameMediaMetadata

    if (!metadata.contentType || !metadata.etag) {
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
    lastModified: media.lastModified
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

async function downloadAndCacheGameMedia(sourceUrl: string, cacheKey: string): Promise<CachedGameMedia> {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'image/*'
    }
  })

  if (!response.ok) {
    throw new Error(`RAWG media fetch failed: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''

  if (!contentType.startsWith('image/')) {
    throw new Error(`RAWG media fetch returned unexpected content type: ${contentType || 'unknown'}`)
  }

  const announcedLength = Number(response.headers.get('content-length') ?? '0')

  if (Number.isFinite(announcedLength) && announcedLength > maxCachedMediaBytes) {
    throw new Error(`RAWG media exceeds cache size limit: ${announcedLength} bytes`)
  }

  const body = Buffer.from(await response.arrayBuffer())

  if (body.length > maxCachedMediaBytes) {
    throw new Error(`RAWG media exceeds cache size limit after download: ${body.length} bytes`)
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

export function toClientGameCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) {
    return null
  }

  const sourceUrl = resolveStoredGameCoverUrl(coverUrl)

  if (!sourceUrl || !parseRawgMediaUrl(sourceUrl)) {
    return sourceUrl
  }

  return `${getApiOrigin()}${mediaProxyPathPrefix}${buildMediaToken(sourceUrl)}`
}

export function resolveStoredGameCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) {
    return null
  }

  try {
    const url = new URL(coverUrl)

    if (!url.pathname.startsWith(mediaProxyPathPrefix)) {
      return coverUrl
    }

    const token = url.pathname.slice(mediaProxyPathPrefix.length)
    return parseMediaToken(token) ?? coverUrl
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

  const pendingDownload = downloadAndCacheGameMedia(sourceUrl, cacheKey).finally(() => {
    inFlightDownloads.delete(cacheKey)
  })

  inFlightDownloads.set(cacheKey, pendingDownload)
  return pendingDownload
}