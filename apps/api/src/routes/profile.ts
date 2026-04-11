import { Router } from 'express'
import type { Request, Response } from 'express'
import { updateUserProfileRequestSchema, userProfileResponseSchema } from '@game-is-up/shared'
import { prisma } from '../lib/prisma.js'
import { getAuthSession } from '../lib/session.js'
import { normalizeTimezoneId } from '../lib/timezone-label.js'

export const profileRouter = Router()

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

    response.json(userProfileResponseSchema.parse(user))
  } catch (error) {
    next(error)
  }
})