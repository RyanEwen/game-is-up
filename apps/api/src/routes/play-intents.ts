import { Router } from 'express'
import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  playIntentDiscordSpaceDeleteResponseSchema,
  playIntentDiscordSpaceRetryResponseSchema,
  playIntentCurrentResponseSchema,
  playIntentDetailResponseSchema,
  playIntentFeedSchema,
  playIntentMutesResponseSchema,
  playIntentRecipientResponseResultSchema,
  upsertPlayIntentRequestSchema,
  upsertPlayIntentResponseSchema
} from '@game-is-up/shared'
import { NotificationResponseChoice, PlayIntentDiscordSpaceStatus } from '@prisma/client'
import { publishPlayIntentInvalidation } from '../lib/dashboard-events.js'
import { buildPlayIntentFeed } from '../lib/play-intent-feed.js'
import { buildPlayIntentDetail } from '../lib/play-intent-detail.js'
import { deletePlayIntentDiscordSpaceByPlayIntentId, provisionPlayIntentDiscordSpaceByPlayIntentId } from '../lib/play-intent-discord-spaces.js'
import {
  clearCurrentPlayIntent,
  getCurrentPlayIntent,
  PlayIntentValidationError,
  upsertCurrentPlayIntent
} from '../lib/play-intents.js'
import { PlayIntentNotificationResponseError, respondToPlayIntentFromWeb } from '../lib/play-intent-notification-responses.js'
import { prisma } from '../lib/prisma.js'
import { getAuthSession } from '../lib/session.js'

export const playIntentRouter = Router()

const playIntentRecipientResponseInputSchema = z.object({
  choice: z.enum(['interested', 'pass', 'join', 'decline'])
})

const muteTargetParamSchema = z.object({ targetUserId: z.string().uuid() })
const playIntentParamSchema = z.object({ playIntentId: z.string().uuid() })

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

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

playIntentRouter.delete('/:playIntentId', async (request, response, next) => {
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
    await clearCurrentPlayIntent(userId, paramsParse.data.playIntentId)

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

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

    publishPlayIntentInvalidation()

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

    publishPlayIntentInvalidation()

    response.json({ muted: false })
  } catch (error) {
    next(error)
  }
})

playIntentRouter.get('/:playIntentId', async (request, response, next) => {
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
    const intent = await buildPlayIntentDetail(userId, paramsParse.data.playIntentId)

    if (!intent) {
      response.status(404).json({ error: 'Call to play not found.' })
      return
    }

    response.json(playIntentDetailResponseSchema.parse({ intent }))
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

    response.json(playIntentRecipientResponseResultSchema.parse(result))
  } catch (error) {
    if (error instanceof PlayIntentNotificationResponseError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }

    next(error)
  }
})

playIntentRouter.post('/:playIntentId/discord-space/retry', async (request, response, next) => {
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
    const playIntent = await prisma.playIntent.findFirst({
      where: {
        id: paramsParse.data.playIntentId,
        userId
      },
      select: {
        id: true,
        discordSpace: {
          select: {
            status: true,
            lastSyncError: true
          }
        }
      }
    })

    if (!playIntent) {
      response.status(404).json({ error: 'Call to play not found.' })
      return
    }

    if (!playIntent.discordSpace) {
      response.status(404).json({ error: 'No temporary Discord channel was found for this call to play.' })
      return
    }

    if (playIntent.discordSpace.status === PlayIntentDiscordSpaceStatus.DELETED) {
      response.status(409).json({ error: 'This temporary Discord channel has already been deleted.' })
      return
    }

    if (!playIntent.discordSpace.lastSyncError) {
      response.status(409).json({ error: 'There is no Discord access error to retry right now.' })
      return
    }

    const result = await provisionPlayIntentDiscordSpaceByPlayIntentId(playIntent.id)

    if (result.status === 'missing') {
      response.json(playIntentDiscordSpaceRetryResponseSchema.parse({
        status: 'missing',
        message: 'No temporary Discord channel was found for this call to play.'
      }))
      return
    }

    if (result.status === 'failed') {
      response.status(502).json({ error: 'Unable to retry the temporary Discord channel access right now.' })
      return
    }

    if (result.status === 'skipped') {
      response.status(409).json({ error: 'This temporary Discord channel can no longer be retried.' })
      return
    }

    response.json(playIntentDiscordSpaceRetryResponseSchema.parse({
      status: 'retrying',
      message: 'Retried the temporary Discord channel access grants.'
    }))
  } catch (error) {
    next(error)
  }
})

playIntentRouter.delete('/:playIntentId/discord-space', async (request, response, next) => {
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
    const playIntent = await prisma.playIntent.findFirst({
      where: {
        id: paramsParse.data.playIntentId,
        userId
      },
      select: {
        id: true,
        expiresAt: true,
        discordSpace: {
          select: {
            status: true
          }
        }
      }
    })

    if (!playIntent) {
      response.status(404).json({ error: 'Call to play not found.' })
      return
    }

    if (playIntent.expiresAt > new Date()) {
      response.status(409).json({ error: 'This call to play is still active.' })
      return
    }

    if (
      !playIntent.discordSpace
      || playIntent.discordSpace.status === PlayIntentDiscordSpaceStatus.REQUESTED
      || playIntent.discordSpace.status === PlayIntentDiscordSpaceStatus.PROVISIONING
      || playIntent.discordSpace.status === PlayIntentDiscordSpaceStatus.DELETED
    ) {
      response.status(409).json({ error: 'No temporary Discord channel is available to delete.' })
      return
    }

    const result = await deletePlayIntentDiscordSpaceByPlayIntentId(playIntent.id)

    if (result.status === 'failed') {
      response.status(502).json({ error: 'Unable to delete the temporary Discord channel right now.' })
      return
    }

    response.json(playIntentDiscordSpaceDeleteResponseSchema.parse({
      status: result.status === 'missing' ? 'missing' : 'deleted',
      message: result.status === 'missing'
        ? 'No temporary Discord channel was found for this call to play.'
        : 'The temporary Discord channel is being removed for this ended call to play.'
    }))
  } catch (error) {
    next(error)
  }
})