import { Router } from 'express'
import { z } from 'zod'
import {
  discordServerPreferencesResponseSchema,
  updateDiscordServerPreferenceRequestSchema
} from '@game-is-up/shared'
import { getAuthSession } from '../lib/session.js'
import {
  buildDiscordServerPreferences,
  updateDiscordServerPreference
} from '../lib/discord-servers.js'

const serverParamsSchema = z.object({
  serverId: z.string().min(1)
})

export const discordServersRouter = Router()

function requireSignedInUserId(request: Parameters<typeof getAuthSession>[0], response: { status: (code: number) => { json: (body: { error: string }) => void } }) {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return null
  }

  return session.userId
}

discordServersRouter.get('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    response.json(discordServerPreferencesResponseSchema.parse(await buildDiscordServerPreferences(userId)))
  } catch (error) {
    next(error)
  }
})

discordServersRouter.put('/me/:serverId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { serverId } = serverParamsSchema.parse(request.params)
    const payload = updateDiscordServerPreferenceRequestSchema.parse(request.body)
    const updated = await updateDiscordServerPreference(userId, serverId, payload.selected)

    if (!updated) {
      response.status(404).json({
        error: 'Discord server not found for this user.'
      })
      return
    }

    response.json(discordServerPreferencesResponseSchema.parse(await buildDiscordServerPreferences(userId)))
  } catch (error) {
    next(error)
  }
})