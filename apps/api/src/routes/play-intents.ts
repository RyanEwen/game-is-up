import { Router } from 'express'
import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import {
  playIntentCurrentResponseSchema,
  playIntentFeedSchema,
  upsertPlayIntentRequestSchema,
  upsertPlayIntentResponseSchema
} from '@game-is-up/shared'
import { buildPlayIntentFeed } from '../lib/play-intent-feed.js'
import {
  clearCurrentPlayIntent,
  getCurrentPlayIntent,
  PlayIntentValidationError,
  upsertCurrentPlayIntent
} from '../lib/play-intents.js'
import { getAuthSession } from '../lib/session.js'

export const playIntentRouter = Router()

function requireSignedInUserId(request: Request, response: Response): string | null {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return null
  }

  return session.userId
}

async function handleFeed(request: Request, response: Response, next: (error: unknown) => void) {
  try {
    const session = getAuthSession(request)
    const feed = await buildPlayIntentFeed(session?.userId)
    response.json(playIntentFeedSchema.parse(feed))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      response.json(
        playIntentFeedSchema.parse({
          generatedAt: new Date().toISOString(),
          intents: []
        })
      )
      return
    }

    next(error)
  }
}

playIntentRouter.get('/feed', handleFeed)
playIntentRouter.get('/examples', handleFeed)

playIntentRouter.get('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    response.json(
      playIntentCurrentResponseSchema.parse({
        activeIntent: await getCurrentPlayIntent(userId)
      })
    )
  } catch (error) {
    next(error)
  }
})

playIntentRouter.put('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const payload = upsertPlayIntentRequestSchema.parse(request.body)
    response.json(upsertPlayIntentResponseSchema.parse(await upsertCurrentPlayIntent(userId, payload)))
  } catch (error) {
    if (error instanceof PlayIntentValidationError) {
      response.status(400).json({
        error: error.message
      })
      return
    }

    next(error)
  }
})

playIntentRouter.delete('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    await clearCurrentPlayIntent(userId)
    response.status(204).send()
  } catch (error) {
    next(error)
  }
})