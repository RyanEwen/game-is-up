/**
 * `/api/discovery` — friends-first discovery feed.
 *
 * Returns the discovery payload (people + games + interest overlap) for the
 * viewer based on explicit follows plus opted-in shared Discord servers. The
 * heavy lifting lives in `lib/discovery-feed.ts`; this router is intentionally
 * thin transport + validation only.
 */

import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { discoveryFeedSchema } from '@game-is-up/shared'
import { buildDiscoveryFeed } from '../lib/discovery-feed.js'
import { getAuthSession } from '../lib/session.js'

export const discoveryRouter = Router()

discoveryRouter.get('/feed', async (_request, response, next) => {
  try {
    const session = getAuthSession(_request)
    const feed = await buildDiscoveryFeed(session?.userId)
    response.json(discoveryFeedSchema.parse(feed))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      response.json(
        discoveryFeedSchema.parse({
          generatedAt: new Date().toISOString(),
          games: [],
          people: [],
        }),
      )
      return
    }

    next(error)
  }
})
