import { Router } from 'express'
import { z } from 'zod'
import { getCachedRawgGameMedia, getCachedSteamGameMedia, getCachedAvatarMedia } from '../lib/game-media.js'

const mediaTokenParamsSchema = z.object({
  token: z.string().min(1).max(4096)
})

export const mediaRouter = Router()

mediaRouter.get('/game-cover/:token', async (request, response, next) => {
  try {
    const { token } = mediaTokenParamsSchema.parse(request.params)
    const media = await getCachedRawgGameMedia(token)

    if (!media) {
      response.status(404).json({
        error: 'Game cover not found.'
      })
      return
    }

    const etag = `"${media.etag}"`

    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
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
})

mediaRouter.get('/steam-cover/:token', async (request, response, next) => {
  try {
    const { token } = mediaTokenParamsSchema.parse(request.params)
    const media = await getCachedSteamGameMedia(token)

    if (!media) {
      response.status(404).json({
        error: 'Steam cover not found.'
      })
      return
    }

    const etag = `"${media.etag}"`

    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400')
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
})

mediaRouter.get('/avatar/:token', async (request, response, next) => {
  try {
    const { token } = mediaTokenParamsSchema.parse(request.params)
    const media = await getCachedAvatarMedia(token)

    if (!media) {
      response.status(404).json({
        error: 'Avatar not found.'
      })
      return
    }

    const etag = `"${media.etag}"`

    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    response.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=604800')
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
})