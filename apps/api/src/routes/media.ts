import { Router } from 'express'
import { getCachedRawgGameMedia, getCachedSteamGameMedia, getCachedAvatarMedia } from '../lib/game-media.js'
import { createMediaHandler } from '../lib/media-handler.js'

export const mediaRouter = Router()

mediaRouter.use((_request, response, next) => {
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
})

mediaRouter.get('/game-cover/:token', createMediaHandler({
  fetcher: getCachedRawgGameMedia,
  cacheControl: 'public, max-age=31536000, immutable',
  notFoundMessage: 'Game cover not found.'
}))

mediaRouter.get('/steam-cover/:token', createMediaHandler({
  fetcher: getCachedSteamGameMedia,
  cacheControl: 'public, max-age=86400, stale-while-revalidate=86400',
  notFoundMessage: 'Steam cover not found.'
}))

mediaRouter.get('/avatar/:token', createMediaHandler({
  fetcher: getCachedAvatarMedia,
  cacheControl: 'public, max-age=3600, stale-while-revalidate=604800',
  notFoundMessage: 'Avatar not found.'
}))
