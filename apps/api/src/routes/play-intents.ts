import { Router } from 'express'
import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  playIntentCurrentResponseSchema,
  playIntentFeedSchema,
  playIntentMutesResponseSchema,
  playIntentRecipientResponseResultSchema,
  upsertPlayIntentRequestSchema,
  upsertPlayIntentResponseSchema
} from '@game-is-up/shared'
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'
import { buildPlayIntentFeed } from '../lib/play-intent-feed.js'
import {
  clearCurrentPlayIntent,
  getCurrentPlayIntent,
  PlayIntentValidationError,
  upsertCurrentPlayIntent
} from '../lib/play-intents.js'
import { NotificationResponseChoice } from '@prisma/client'
import { PlayIntentNotificationResponseError, respondToPlayIntentFromWeb } from '../lib/play-intent-notification-responses.js'
import { prisma } from '../lib/prisma.js'
import { getAuthSession } from '../lib/session.js'

export const playIntentRouter = Router()

const playIntentRecipientResponseInputSchema = z.object({
  choice: z.enum(['interested', 'pass', 'join', 'decline'])
})

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

    const requestUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true }
    })

    if (payload.includeSelf && !requestUser?.isAdmin) {
      response.status(403).json({
        error: 'Admin access is required to target yourself with a test call to play.'
      })
      return
    }

    const result = await upsertCurrentPlayIntent(userId, payload)

    publishDashboardInvalidation({
      domains: ['play-intents', 'discovery']
    })

    response.json(upsertPlayIntentResponseSchema.parse(result))
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

    publishDashboardInvalidation({
      domains: ['play-intents', 'discovery']
    })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

const muteTargetParamSchema = z.object({ targetUserId: z.string().uuid() })
const playIntentParamSchema = z.object({ playIntentId: z.string().uuid() })

playIntentRouter.get('/mutes', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const mutes = await prisma.playIntentMute.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        mutedUserId: true,
        mutedUser: {
          select: {
            displayName: true,
            handle: true,
            avatarUrl: true
          }
        }
      }
    })

    response.json(playIntentMutesResponseSchema.parse({
      mutes: mutes.map((mute) => ({
        mutedUserId: mute.mutedUserId,
        mutedUserDisplayName: mute.mutedUser.displayName,
        mutedUserHandle: mute.mutedUser.handle,
        mutedUserAvatarUrl: mute.mutedUser.avatarUrl
      }))
    }))
  } catch (error) {
    next(error)
  }
})

playIntentRouter.put('/mutes/:targetUserId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const paramsParse = muteTargetParamSchema.safeParse(request.params)

  if (!paramsParse.success) {
    response.status(400).json({ error: 'Invalid user ID.' })
    return
  }

  const { targetUserId } = paramsParse.data

  if (targetUserId === userId) {
    response.status(400).json({ error: 'Cannot mute your own calls to play.' })
    return
  }

  try {
    await prisma.playIntentMute.upsert({
      where: { userId_mutedUserId: { userId, mutedUserId: targetUserId } },
      create: { userId, mutedUserId: targetUserId },
      update: {}
    })

    response.json({ muted: true })
  } catch (error) {
    next(error)
  }
})

playIntentRouter.delete('/mutes/:targetUserId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const paramsParse = muteTargetParamSchema.safeParse(request.params)

  if (!paramsParse.success) {
    response.status(400).json({ error: 'Invalid user ID.' })
    return
  }

  const { targetUserId } = paramsParse.data

  try {
    await prisma.playIntentMute.deleteMany({
      where: { userId, mutedUserId: targetUserId }
    })

    response.json({ muted: false })
  } catch (error) {
    next(error)
  }
})

playIntentRouter.post('/:playIntentId/respond', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const paramsParse = playIntentParamSchema.safeParse(request.params)

  if (!paramsParse.success) {
    response.status(400).json({ error: 'Invalid play intent ID.' })
    return
  }

  try {
    const payload = playIntentRecipientResponseInputSchema.parse(request.body)
    const result = await respondToPlayIntentFromWeb({
      userId,
      playIntentId: paramsParse.data.playIntentId,
      response: payload.choice === 'interested' || payload.choice === 'join'
        ? NotificationResponseChoice.JOIN
        : NotificationResponseChoice.DECLINE
    })

    publishDashboardInvalidation({
      domains: ['play-intents', 'discovery']
    })

    response.json(playIntentRecipientResponseResultSchema.parse(result))
  } catch (error) {
    if (error instanceof PlayIntentNotificationResponseError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }

    next(error)
  }
})