/**
 * Health routes (PLAT-15), both unauthenticated.
 *
 * - `GET /api/health`: liveness, used by Docker, monitors and the web client's reconnect logic.
 *   It answers whenever the process is serving, so a database outage never restarts the container.
 * - `GET /api/health/ready`: readiness, whether the API can serve requests. It pings the database
 *   with a time limit, so a hung database cannot hang the probe, and answers 503 in the error shape
 *   when it fails. The Discord bot is optional and does not count.
 */

import { Router } from 'express'
import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@game-is-up/shared'
import { sendError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'

/** How long the readiness database ping may take before the API counts as not ready. */
const readinessTimeoutMs = 2000

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

healthRouter.get('/ready', async (_request, response) => {
  try {
    await pingDatabase()
  } catch (error) {
    logger.warn('Readiness check failed', { error })
    sendError(response, 503, 'The database is not reachable.', 'not_ready')
    return
  }

  response.json(
    readinessResponseSchema.parse({
      status: 'ready',
      checks: { database: 'ok' },
      timestamp: new Date().toISOString(),
    }),
  )
})

/** Resolve when the database answers a trivial query; reject on failure or after the time limit. */
async function pingDatabase(): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('The database ping timed out.')),
      readinessTimeoutMs,
    )
  })

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout])
  } finally {
    clearTimeout(timer)
  }
}
