import { Router } from 'express'
import { z } from 'zod'
import {
  isDiscordEventWebhookConfigured,
  recordDiscordAccountAuthorized,
  recordDiscordAccountDeauthorized,
  verifyDiscordEventSignature
} from '../lib/discord-account-installs.js'

export const discordEventsRouter = Router()

const discordWebhookUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional()
})

const discordWebhookPayloadSchema = z.object({
  type: z.number().int(),
  event: z.object({
    type: z.string().min(1),
    timestamp: z.string().datetime(),
    data: z.object({
      integration_type: z.number().int().optional(),
      scopes: z.array(z.string().min(1)).optional(),
      user: discordWebhookUserSchema
    }).passthrough()
  }).optional()
}).passthrough()

discordEventsRouter.post('/', async (request, response, next) => {
  if (!isDiscordEventWebhookConfigured()) {
    response.status(503).json({
      error: 'Discord event webhook verification is not configured.'
    })
    return
  }

  const signature = request.header('X-Signature-Ed25519')
  const timestamp = request.header('X-Signature-Timestamp')
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)

  if (!signature || !timestamp || !verifyDiscordEventSignature(signature, timestamp, rawBody)) {
    response.status(401).json({
      error: 'Invalid Discord webhook signature.'
    })
    return
  }

  try {
    const payload = discordWebhookPayloadSchema.parse(JSON.parse(rawBody.toString('utf8')))

    if (payload.type === 0) {
      response.status(204).type('application/json').send()
      return
    }

    if (payload.type === 1 && payload.event) {
      if (payload.event.type === 'APPLICATION_AUTHORIZED' && payload.event.data.integration_type === 1) {
        await recordDiscordAccountAuthorized({
          discordUser: payload.event.data.user,
          grantedScopes: payload.event.data.scopes ?? [],
          occurredAt: new Date(payload.event.timestamp)
        })
      }

      if (payload.event.type === 'APPLICATION_DEAUTHORIZED') {
        await recordDiscordAccountDeauthorized({
          discordUser: payload.event.data.user,
          occurredAt: new Date(payload.event.timestamp)
        })
      }
    }

    response.status(204).type('application/json').send()
  } catch (error) {
    next(error)
  }
})