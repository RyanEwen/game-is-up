/**
 * `/api/profile` — the viewer's own profile fields.
 *
 * Currently exposes a `GET /me` and a partial-update `PATCH /me` for fields
 * that the web profile page can edit (timezone id, default availability copy,
 * Discord auto-prompt opt-in). Any update publishes a dashboard invalidation
 * so other tabs pick up the change.
 */

import { Router } from 'express'
import { updateUserProfileRequestSchema, userProfileResponseSchema } from '@game-is-up/shared'
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'
import { prisma } from '../lib/prisma.js'
import { requireSignedInUserId } from '../lib/route-auth.js'
import { normalizeTimezoneId } from '../lib/timezone-label.js'

export const profileRouter = Router()

profileRouter.put('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const payload = updateUserProfileRequestSchema.parse(request.body)
    const usualAvailability = payload.usualAvailability?.trim() ? payload.usualAvailability.trim() : null
    const timezoneId = payload.timezoneId == null ? undefined : normalizeTimezoneId(payload.timezoneId)

    if (payload.timezoneId != null && !timezoneId) {
      response.status(400).json({
        error: 'Use a valid IANA time zone like America/New_York.'
      })
      return
    }

    const user = await prisma.user.update({
      where: {
        id: userId
      },
      select: {
        timezoneId: true,
        usualAvailability: true,
        discordAutoPromptPlayIntent: true
      },
      data: {
        usualAvailability,
        ...(payload.discordAutoPromptPlayIntent != null ? { discordAutoPromptPlayIntent: payload.discordAutoPromptPlayIntent } : {}),
        ...(timezoneId ? { timezoneId } : {})
      }
    })

    publishDashboardInvalidation({
      domains: ['auth', 'profile', 'library', 'play-intents'],
      userIds: [userId]
    })

    response.json(userProfileResponseSchema.parse(user))
  } catch (error) {
    next(error)
  }
})