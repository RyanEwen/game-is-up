import { Router } from 'express'
import { buildDebugAdminSnapshot } from '../lib/debug-admin.js'
import { env } from '../lib/env.js'
import { getAuthSession } from '../lib/session.js'

export const debugRouter = Router()

debugRouter.get('/admin', async (request, response, next) => {
  if (env.NODE_ENV === 'production') {
    response.status(404).json({
      error: 'Debug routes are disabled in production.'
    })
    return
  }

  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return
  }

  try {
    response.json(await buildDebugAdminSnapshot())
  } catch (error) {
    next(error)
  }
})