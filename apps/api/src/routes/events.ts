/**
 * `/api/events` — Server-Sent Events stream for dashboard invalidation.
 *
 * Signed-in dashboard tabs subscribe to a single SSE connection here and
 * receive low-detail invalidation envelopes (`{ domains: [...] }`) when shared
 * state changes elsewhere in the system. The web client uses those envelopes
 * to debounce a normal HTTP refetch of affected dashboard slices.
 */

import { Router } from 'express'
import { subscribeToDashboardInvalidations } from '../lib/dashboard-events.js'
import { requireSignedInUserId } from '../lib/route-auth.js'

export const eventsRouter = Router()

eventsRouter.get('/dashboard', (request, response) => {
  const userId = requireSignedInUserId(request, response)

  if (!userId) {
    return
  }

  response.status(200)
  response.setHeader('Content-Type', 'text/event-stream')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.setHeader('X-Accel-Buffering', 'no')
  response.flushHeaders?.()
  response.write('retry: 5000\n\n')

  const unsubscribe = subscribeToDashboardInvalidations(userId, (event) => {
    response.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
  })

  const heartbeatId = setInterval(() => {
    response.write(`: keepalive ${Date.now()}\n\n`)
  }, 15000)

  request.on('close', () => {
    clearInterval(heartbeatId)
    unsubscribe()
    response.end()
  })
})
