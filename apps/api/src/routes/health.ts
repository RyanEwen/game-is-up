/**
 * `/api/health` — unauthenticated liveness probe used by Docker, monitors,
 * and the web client's reconnect logic. Returns the canonical health envelope
 * so Compose-level health checks and the SSE reconnect path share one shape.
 */

import { Router } from 'express'
import { healthResponseSchema } from '@game-is-up/shared'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.json(
    healthResponseSchema.parse({
      status: 'ok',
      service: 'game-is-up-api',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    }),
  )
})
