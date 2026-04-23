import type { Request, RequestHandler, Response } from 'express'
import { z } from 'zod'

const mediaTokenParamsSchema = z.object({
  token: z.string().min(1).max(4096)
})

export type MediaPayload = {
  body: Buffer | Uint8Array | string
  contentType: string
  etag: string
  lastModified?: string | null
}

export type MediaFetcher = (token: string) => Promise<MediaPayload | null>

export type MediaHandlerOptions = {
  fetcher: MediaFetcher
  cacheControl: string
  notFoundMessage: string
}

/**
 * Build an Express handler that serves cached media keyed by a URL-encoded
 * token. Centralizes the shared parse/fetch/etag/cache-headers/304 flow so
 * each media route only needs to declare its data source and caching policy.
 */
export function createMediaHandler({ fetcher, cacheControl, notFoundMessage }: MediaHandlerOptions): RequestHandler {
  return async (request: Request, response: Response, next) => {
    try {
      const { token } = mediaTokenParamsSchema.parse(request.params)
      const media = await fetcher(token)

      if (!media) {
        response.status(404).json({ error: notFoundMessage })
        return
      }

      const etag = `"${media.etag}"`

      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      response.setHeader('Cache-Control', cacheControl)
      response.setHeader('ETag', etag)

      if (media.lastModified) {
        response.setHeader('Last-Modified', media.lastModified)
      }

      if (request.headers['if-none-match'] === etag) {
        response.status(304).end()
        return
      }

      response.type(media.contentType)
      response.send(media.body)
    } catch (error) {
      next(error)
    }
  }
}
