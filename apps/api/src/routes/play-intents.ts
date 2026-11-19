/**
 * `/api/play-intents` — calls-to-play CRUD, audience responses, mutes, and the
 * temporary-Discord-space side flow.
 *
 * This is the busiest route module in the system and intentionally talks
 * directly to the play-intent service layer in `lib/play-intents.ts`,
 * `lib/play-intent-detail.ts`, `lib/play-intent-feed.ts`, and friends. Quiet
 * edits (title-only) deliberately skip recipient re-notification; substantive
 * edits trigger audience-response invalidation as defined by
 * `shouldInvalidatePlayIntentAudienceResponse` in `@game-is-up/shared`.
 *
 * Several endpoints are admin-gated (force delete, retry/delete a Discord
 * space on behalf of another user) via `getUserAdminStatus`.
 */

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
  playIntentRecipientResponseRequestSchema,
  upsertPlayIntentRequestSchema,
  upsertPlayIntentResponseSchema,
} from '@game-is-up/shared'
import {
  NotificationResponseChoice,
  PlayIntentDiscordSpaceStatus,
} from '@prisma/client'
import { publishPlayIntentInvalidation } from '../lib/dashboard-events.js'
import { buildPlayIntentFeed } from '../lib/play-intent-feed.js'
import { buildPlayIntentDetail } from '../lib/play-intent-detail.js'
import {
  deletePlayIntentDiscordSpaceByPlayIntentId,
  provisionPlayIntentDiscordSpaceByPlayIntentId,
} from '../lib/play-intent-discord-spaces.js'
import {
  clearCurrentPlayIntent,
  deletePlayIntentWithAdminCleanup,
  getCurrentPlayIntent,
  PlayIntentValidationError,
  upsertCurrentPlayIntent,
} from '../lib/play-intents.js'
import {
  PlayIntentNotificationResponseError,
  ScheduledPlayIntentStartError,
  markRunningLateFromWeb,
  respondToPlayIntentFromWeb,
  startScheduledPlayIntentNow,
} from '../lib/play-intent-notification-responses.js'
import { playIntentFriendInviteRouter } from './play-intent-friend-invites.js'
import { prisma } from '../lib/prisma.js'
import { getAuthSession } from '../lib/session.js'
import { getUserAdminStatus, requireSignedInUserId } from '../lib/route-auth.js'
import { sendError } from '../lib/http-error.js'
import { notificationLimit } from '../lib/rate-limits.js'

export const playIntentRouter = Router()

const muteTargetParamSchema = z.object({ targetUserId: z.uuid() })
const playIntentParamSchema = z.object({ playIntentId: z.uuid() })

async function handleFeed(
  request: Request,
  response: Response,
  next: (error: unknown) => void,
) {
  try {
    const session = getAuthSession(request)
    const feed = await buildPlayIntentFeed(session?.userId)
    response.json(playIntentFeedSchema.parse(feed))
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      response.json(
        playIntentFeedSchema.parse({
          generatedAt: new Date().toISOString(),
          intents: [],
        }),
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
        activeIntent: await getCurrentPlayIntent(userId),
      }),
    )
  } catch (error) {
    next(error)
  }
})

playIntentRouter.put(
  '/me',
  notificationLimit,
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    try {
      const payload = upsertPlayIntentRequestSchema.parse(request.body)

      const requestUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      })

      if (payload.includeSelf && !requestUser?.isAdmin) {
        sendError(
          response,
          403,
          'Admin access is required to target yourself with a test call to play.',
        )
        return
      }

      const result = await upsertCurrentPlayIntent(userId, payload)

      response.json(upsertPlayIntentResponseSchema.parse(result))
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(
          response,
          400,
          error.issues[0]?.message ?? 'Invalid call-to-play payload.',
        )
        return
      }

      if (error instanceof PlayIntentValidationError) {
        sendError(response, 400, error.message)
        return
      }

      next(error)
    }
  },
)

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
    sendError(response, 400, 'Invalid play intent ID.')
    return
  }

  try {
    await clearCurrentPlayIntent(userId, paramsParse.data.playIntentId)

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

playIntentRouter.post(
  '/:playIntentId/start-now',
  notificationLimit,
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = playIntentParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid play intent ID.')
      return
    }

    try {
      await startScheduledPlayIntentNow(paramsParse.data.playIntentId, userId)

      response.status(204).send()
    } catch (error) {
      if (error instanceof ScheduledPlayIntentStartError) {
        sendError(response, 400, error.message)
        return
      }

      next(error)
    }
  },
)

playIntentRouter.delete(
  '/:playIntentId/admin',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = playIntentParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid play intent ID.')
      return
    }

    const requestUser = await getUserAdminStatus(userId)

    if (!requestUser?.isAdmin) {
      sendError(response, 403, 'Admin access required.')
      return
    }

    try {
      await deletePlayIntentWithAdminCleanup(paramsParse.data.playIntentId)

      response.status(204).send()
    } catch (error) {
      if (error instanceof PlayIntentValidationError) {
        sendError(response, 404, error.message)
        return
      }

      next(error)
    }
  },
)

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
            avatarUrl: true,
          },
        },
      },
    })

    response.json(
      playIntentMutesResponseSchema.parse({
        mutes: mutes.map((mute) => ({
          mutedUserId: mute.mutedUserId,
          mutedUserDisplayName: mute.mutedUser.displayName,
          mutedUserHandle: mute.mutedUser.handle,
          mutedUserAvatarUrl: mute.mutedUser.avatarUrl,
        })),
      }),
    )
  } catch (error) {
    next(error)
  }
})

playIntentRouter.put(
  '/mutes/:targetUserId',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = muteTargetParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid user ID.')
      return
    }

    const { targetUserId } = paramsParse.data

    if (targetUserId === userId) {
      sendError(response, 400, 'Cannot mute your own calls to play.')
      return
    }

    try {
      await prisma.playIntentMute.upsert({
        where: { userId_mutedUserId: { userId, mutedUserId: targetUserId } },
        create: { userId, mutedUserId: targetUserId },
        update: {},
      })

      publishPlayIntentInvalidation()

      response.json({ muted: true })
    } catch (error) {
      next(error)
    }
  },
)

playIntentRouter.delete(
  '/mutes/:targetUserId',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = muteTargetParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid user ID.')
      return
    }

    const { targetUserId } = paramsParse.data

    try {
      await prisma.playIntentMute.deleteMany({
        where: { userId, mutedUserId: targetUserId },
      })

      publishPlayIntentInvalidation()

      response.json({ muted: false })
    } catch (error) {
      next(error)
    }
  },
)

playIntentRouter.get('/:playIntentId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  const paramsParse = playIntentParamSchema.safeParse(request.params)

  if (!paramsParse.success) {
    sendError(response, 400, 'Invalid play intent ID.')
    return
  }

  try {
    const intent = await buildPlayIntentDetail(
      userId,
      paramsParse.data.playIntentId,
    )

    if (!intent) {
      sendError(response, 404, 'Call to play not found.')
      return
    }

    response.json(playIntentDetailResponseSchema.parse({ intent }))
  } catch (error) {
    next(error)
  }
})

playIntentRouter.post(
  '/:playIntentId/respond',
  notificationLimit,
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = playIntentParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid play intent ID.')
      return
    }

    try {
      const payload = playIntentRecipientResponseRequestSchema.parse(
        request.body,
      )
      const result =
        payload.choice === 'late'
          ? await markRunningLateFromWeb({
              userId,
              playIntentId: paramsParse.data.playIntentId,
              runningLateMinutes: payload.runningLateMinutes,
            })
          : await respondToPlayIntentFromWeb({
              userId,
              playIntentId: paramsParse.data.playIntentId,
              response:
                payload.choice === 'interested'
                  ? NotificationResponseChoice.JOIN
                  : NotificationResponseChoice.DECLINE,
            })

      response.json(playIntentRecipientResponseResultSchema.parse(result))
    } catch (error) {
      if (error instanceof PlayIntentNotificationResponseError) {
        response.status(error.statusCode).json({ error: error.message })
        return
      }

      next(error)
    }
  },
)

playIntentRouter.post(
  '/:playIntentId/discord-space/retry',
  notificationLimit,
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = playIntentParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid play intent ID.')
      return
    }

    try {
      const playIntent = await prisma.playIntent.findFirst({
        where: {
          id: paramsParse.data.playIntentId,
          userId,
        },
        select: {
          id: true,
          discordSpace: {
            select: {
              status: true,
              lastSyncError: true,
            },
          },
        },
      })

      if (!playIntent) {
        sendError(response, 404, 'Call to play not found.')
        return
      }

      if (!playIntent.discordSpace) {
        sendError(
          response,
          404,
          'No temporary Discord channel was found for this call to play.',
        )
        return
      }

      if (
        playIntent.discordSpace.status === PlayIntentDiscordSpaceStatus.DELETED
      ) {
        sendError(
          response,
          409,
          'This temporary Discord channel has already been deleted.',
        )
        return
      }

      if (!playIntent.discordSpace.lastSyncError) {
        sendError(
          response,
          409,
          'There is no Discord access error to retry right now.',
        )
        return
      }

      const result = await provisionPlayIntentDiscordSpaceByPlayIntentId(
        playIntent.id,
      )

      if (result.status === 'missing') {
        response.json(
          playIntentDiscordSpaceRetryResponseSchema.parse({
            status: 'missing',
            message:
              'No temporary Discord channel was found for this call to play.',
          }),
        )
        return
      }

      if (result.status === 'failed') {
        sendError(
          response,
          502,
          'Unable to retry the temporary Discord channel access right now.',
        )
        return
      }

      if (result.status === 'skipped') {
        sendError(
          response,
          409,
          'This temporary Discord channel can no longer be retried.',
        )
        return
      }

      response.json(
        playIntentDiscordSpaceRetryResponseSchema.parse({
          status: 'retrying',
          message: 'Retried the temporary Discord channel access grants.',
        }),
      )
    } catch (error) {
      next(error)
    }
  },
)

playIntentRouter.delete(
  '/:playIntentId/discord-space',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    const paramsParse = playIntentParamSchema.safeParse(request.params)

    if (!paramsParse.success) {
      sendError(response, 400, 'Invalid play intent ID.')
      return
    }

    try {
      const playIntent = await prisma.playIntent.findFirst({
        where: {
          id: paramsParse.data.playIntentId,
          userId,
        },
        select: {
          id: true,
          expiresAt: true,
          discordSpace: {
            select: {
              status: true,
            },
          },
        },
      })

      if (!playIntent) {
        sendError(response, 404, 'Call to play not found.')
        return
      }

      if (playIntent.expiresAt > new Date()) {
        sendError(response, 409, 'This call to play is still active.')
        return
      }

      if (
        !playIntent.discordSpace ||
        playIntent.discordSpace.status ===
          PlayIntentDiscordSpaceStatus.REQUESTED ||
        playIntent.discordSpace.status ===
          PlayIntentDiscordSpaceStatus.PROVISIONING ||
        playIntent.discordSpace.status === PlayIntentDiscordSpaceStatus.DELETED
      ) {
        sendError(
          response,
          409,
          'No temporary Discord channel is available to delete.',
        )
        return
      }

      const result = await deletePlayIntentDiscordSpaceByPlayIntentId(
        playIntent.id,
      )

      if (result.status === 'failed') {
        sendError(
          response,
          502,
          'Unable to delete the temporary Discord channel right now.',
        )
        return
      }

      response.json(
        playIntentDiscordSpaceDeleteResponseSchema.parse({
          status: result.status === 'missing' ? 'missing' : 'deleted',
          message:
            result.status === 'missing'
              ? 'No temporary Discord channel was found for this call to play.'
              : 'The temporary Discord channel is being removed for this ended call to play.',
        }),
      )
    } catch (error) {
      next(error)
    }
  },
)

playIntentRouter.use(playIntentFriendInviteRouter)
