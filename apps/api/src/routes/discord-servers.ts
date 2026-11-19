/**
 * `/api/discord-servers` — Discord-server preferences and per-server members.
 *
 * Reads the viewer's opted-in shared servers (used by discovery and play-intent
 * audience scopes), refreshes the live Discord server list via the stored
 * Discord refresh token, lists members for invite flows, and persists
 * per-server preferences and selected voice channels. Slash-command driven
 * server invites also funnel through this router.
 */

import { Router } from 'express'
import { z } from 'zod'
import {
  discordVoiceChannelsResponseSchema,
  discordServerMembersResponseSchema,
  discordServerPreferencesResponseSchema,
  sendDiscordServerInvitesRequestSchema,
  sendDiscordServerInvitesResponseSchema,
  updateDiscordServerPreferenceRequestSchema,
} from '@game-is-up/shared'
import { requireSignedInUserId } from '../lib/route-auth.js'
import {
  buildDiscordServerMembers,
  buildSelectedDiscordVoiceChannels,
  buildDiscordServerPreferences,
  refreshDiscordServerPreferences,
  sendDiscordServerInvites,
  updateDiscordServerPreference,
} from '../lib/discord-servers.js'
import { publishDashboardInvalidation } from '../lib/dashboard-events.js'
import { sendError } from '../lib/http-error.js'

const serverParamsSchema = z.object({
  serverId: z.string().min(1),
})

export const discordServersRouter = Router()

discordServersRouter.get('/me', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    response.json(
      discordServerPreferencesResponseSchema.parse(
        await buildDiscordServerPreferences(userId),
      ),
    )
  } catch (error) {
    next(error)
  }
})

discordServersRouter.post('/me/refresh', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const result = await refreshDiscordServerPreferences(userId)

    if (result.status === 'not-linked') {
      sendError(response, 404, 'Discord identity not found for this user.')
      return
    }

    if (result.status === 'missing-scope') {
      sendError(
        response,
        403,
        'Reconnect Discord with server access enabled before refreshing your server list.',
      )
      return
    }

    if (result.status === 'reauth-required') {
      sendError(
        response,
        409,
        'Discord server refresh needs you to reconnect your Discord account.',
      )
      return
    }

    publishDashboardInvalidation({
      domains: ['network', 'discovery', 'play-intents'],
    })

    response.json(discordServerPreferencesResponseSchema.parse(result.response))
  } catch (error) {
    next(error)
  }
})

discordServersRouter.get(
  '/me/voice-channels',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    try {
      response.json(
        discordVoiceChannelsResponseSchema.parse(
          await buildSelectedDiscordVoiceChannels(userId),
        ),
      )
    } catch (error) {
      next(error)
    }
  },
)

discordServersRouter.get(
  '/me/:serverId/members',
  async (request, response, next) => {
    const userId = requireSignedInUserId(request, response)

    if (!userId) {
      return
    }

    try {
      const { serverId } = serverParamsSchema.parse(request.params)
      const result = await buildDiscordServerMembers(userId, serverId)

      if (result.status === 'not-found') {
        sendError(response, 404, 'Discord server not found for this user.')
        return
      }

      if (result.status === 'not-selected') {
        sendError(
          response,
          403,
          'Turn this server on for player finding before browsing members.',
        )
        return
      }

      if (result.status === 'unavailable') {
        sendError(response, 503, result.reason)
        return
      }

      response.json(discordServerMembersResponseSchema.parse(result.response))
    } catch (error) {
      next(error)
    }
  },
)

discordServersRouter.post(
  '/me/:serverId/invites',
  async (request, response, next) => {
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
        inviteUrl: payload.inviteUrl,
      })

      if (result.status === 'not-found') {
        sendError(response, 404, 'Discord server not found for this user.')
        return
      }

      if (result.status === 'not-selected') {
        sendError(
          response,
          403,
          'Only selected bot-enabled servers can send bot invites.',
        )
        return
      }

      if (result.status === 'unavailable') {
        sendError(response, 503, result.reason)
        return
      }

      response.json(
        sendDiscordServerInvitesResponseSchema.parse(result.response),
      )
    } catch (error) {
      next(error)
    }
  },
)

discordServersRouter.put('/me/:serverId', async (request, response, next) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  try {
    const { serverId } = serverParamsSchema.parse(request.params)
    const payload = updateDiscordServerPreferenceRequestSchema.parse(
      request.body,
    )
    const updated = await updateDiscordServerPreference(
      userId,
      serverId,
      payload.selected,
    )

    if (updated === 'not-found') {
      sendError(response, 404, 'Discord server not found for this user.')
      return
    }

    if (updated === 'bot-required') {
      sendError(
        response,
        403,
        'Only servers with the bot installed can be used for discovery and invites.',
      )
      return
    }

    publishDashboardInvalidation({
      domains: ['network', 'discovery', 'play-intents'],
    })

    response.json(
      discordServerPreferencesResponseSchema.parse(
        await buildDiscordServerPreferences(userId),
      ),
    )
  } catch (error) {
    next(error)
  }
})
