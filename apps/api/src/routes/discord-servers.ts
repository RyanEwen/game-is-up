import { Router } from 'express'
import { z } from 'zod'
import {
  discordVoiceChannelsResponseSchema,
  discordServerMembersResponseSchema,
  discordServerPreferencesResponseSchema,
  sendDiscordServerInvitesRequestSchema,
  sendDiscordServerInvitesResponseSchema,
  updateDiscordServerPreferenceRequestSchema
} from '@game-is-up/shared'
import { getAuthSession } from '../lib/session.js'
import {
  buildDiscordServerMembers,
  buildSelectedDiscordVoiceChannels,
  buildDiscordServerPreferences,
  sendDiscordServerInvites,
  updateDiscordServerPreference
} from '../lib/discord-servers.js'
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'

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

discordServersRouter.get('/me/voice-channels', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    response.json(discordVoiceChannelsResponseSchema.parse(await buildSelectedDiscordVoiceChannels(userId)))
  } catch (error) {
    next(error)
  }
})

discordServersRouter.get('/me/:serverId/members', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { serverId } = serverParamsSchema.parse(request.params)
    const result = await buildDiscordServerMembers(userId, serverId)

    if (result.status === 'not-found') {
      response.status(404).json({
        error: 'Discord server not found for this user.'
      })
      return
    }

    if (result.status === 'not-selected') {
      response.status(403).json({
        error: 'Turn this server on for player finding before browsing members.'
      })
      return
    }

    if (result.status === 'unavailable') {
      response.status(503).json({
        error: result.reason
      })
      return
    }

    response.json(discordServerMembersResponseSchema.parse(result.response))
  } catch (error) {
    next(error)
  }
})

discordServersRouter.post('/me/:serverId/invites', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { serverId } = serverParamsSchema.parse(request.params)
    const payload = sendDiscordServerInvitesRequestSchema.parse(request.body)
    const result = await sendDiscordServerInvites({
      userId,
      serverId,
      memberIds: payload.memberIds,
      inviteUrl: payload.inviteUrl
    })

    if (result.status === 'not-found') {
      response.status(404).json({
        error: 'Discord server not found for this user.'
      })
      return
    }

    if (result.status === 'not-selected') {
      response.status(403).json({
        error: 'Only selected bot-enabled servers can send bot invites.'
      })
      return
    }

    if (result.status === 'unavailable') {
      response.status(503).json({
        error: result.reason
      })
      return
    }

    response.json(sendDiscordServerInvitesResponseSchema.parse(result.response))
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

    if (updated === 'not-found') {
      response.status(404).json({
        error: 'Discord server not found for this user.'
      })
      return
    }

    if (updated === 'bot-required') {
      response.status(403).json({
        error: 'Only servers with the bot installed can be used for discovery and invites.'
      })
      return
    }

    publishDashboardInvalidation({
      domains: ['network', 'discovery', 'play-intents']
    })

    response.json(discordServerPreferencesResponseSchema.parse(await buildDiscordServerPreferences(userId)))
  } catch (error) {
    next(error)
  }
})