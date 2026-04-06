import { Router } from 'express'
import { healthResponseSchema } from '@game-is-up/shared'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.json(
    healthResponseSchema.parse({
      status: 'ok',
      service: 'game-is-up-api',
      timestamp: new Date().toISOString(),
      version: '0.1.0'
    })
  )
})