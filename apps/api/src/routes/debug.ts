/**
 * `/api/debug` — admin-only diagnostics surface.
 *
 * Returns a serialized snapshot of bot state, recent notifications, recent
 * play-intent lifecycle events, recent errors, and DM previews so the web
 * debug view can inspect live system state without a separate dashboard.
 * All endpoints in this router require an admin user.
 */

import { Router } from 'express'
import { buildDebugAdminSnapshot } from '../lib/debug-admin.js'
import { getAuthSession } from '../lib/session.js'
import { getUserAdminStatus } from '../lib/route-auth.js'

export const debugRouter = Router()

debugRouter.get('/admin', async (request, response, next) => {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.',
    })
    return
  }

  const user = await getUserAdminStatus(session.userId)

  if (!user?.isAdmin) {
    response.status(403).json({
      error: 'Admin access required.',
    })
    return
  }

  try {
    response.json(await buildDebugAdminSnapshot())
  } catch (error) {
    next(error)
  }
})
