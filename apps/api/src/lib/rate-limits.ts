/**
 * Rate limits (SEC-8), applied per route rather than to the whole API: the media route serves
 * many cover images per page and the dashboard refetches in bursts, so a global budget would
 * throttle normal use. What is limited is SEC-8's minimum:
 *
 * - `signInLimit`: Discord sign-in and Steam linking, where a caller presents an OAuth code or
 *   state that could otherwise be guessed at machine speed.
 * - `notificationLimit`: writes that send Discord DMs or posts (saving or starting a call to play,
 *   answering one, inviting a friend, retrying a Discord space), so one client cannot make the bot
 *   spam people.
 *
 * Counts are per client address in memory, which suits the single API instance. The address is
 * the real client only because `trust proxy` is 1 in `app.ts` and the server's nginx site restores
 * the visitor's address from Cloudflare (`nginx.server.conf`). A rejected request gets the API's
 * error shape with code `rate_limited`.
 */
import { rateLimit, type Options } from 'express-rate-limit'
import { sendError } from './http-error.js'
import { logger } from './logger.js'

const rejectionMessage = 'Too many requests. Wait a moment and try again.'

/** Answer a rejected request in the error shape, and note it in the log. */
const rejectWithErrorShape: Options['handler'] = (request, response) => {
  logger.warn('Rate limit reached', {
    method: request.method,
    // The full path without the query string (LOG-6); `path` alone is relative to the router.
    path: `${request.baseUrl}${request.path}`,
  })
  sendError(response, 429, rejectionMessage, 'rate_limited')
}

/** Settings every limiter shares: standard `RateLimit` headers and the error-shape rejection. */
const sharedOptions = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rejectWithErrorShape,
} as const

/** Sign-in and account-linking routes: 30 attempts per client per 15 minutes. */
export const signInLimit = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60_000,
  limit: 30,
})

/** Writes that notify other people through Discord: 60 per client per 15 minutes. */
export const notificationLimit = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60_000,
  limit: 60,
})
