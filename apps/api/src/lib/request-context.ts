/**
 * Request-scoped correlation id (LOG-3, PLAT-15).
 *
 * The id is minted once at the edge of a request and made ambient through `AsyncLocalStorage`, so
 * every log line written while handling that request carries the same id (see `logger.ts`). It is
 * returned on the `X-Request-Id` response header and in error bodies, so a failure a user reports
 * can be matched to the server's log lines.
 *
 * The middleware is mounted before everything else, so even CORS, rate-limit and parse failures
 * are correlated. An inbound `X-Request-Id` is honoured only when it is short and plain, so a
 * caller cannot inject large or unsafe values into the logs. Modelled on printstream's.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

type RequestContext = {
  requestId: string
}

const requestIdHeader = 'x-request-id'
/** What an inbound id may look like; anything else is replaced with a fresh UUID. */
const safeRequestId = /^[A-Za-z0-9._-]{1,128}$/

const requestContextStorage = new AsyncLocalStorage<RequestContext>()

/**
 * Express middleware that gives each request its correlation id and echoes it on the response.
 * Mount it first.
 */
export function requestContext() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = readInboundRequestId(request) ?? randomUUID()
    response.setHeader('X-Request-Id', requestId)
    requestContextStorage.run({ requestId }, () => next())
  }
}

/** The current request's correlation id, or null outside a request (startup, the Discord bot). */
export function getRequestId(): string | null {
  return requestContextStorage.getStore()?.requestId ?? null
}

/** A caller-supplied id, when it passes the safety check; otherwise null. */
function readInboundRequestId(
  request: Pick<Request, 'headers'>,
): string | null {
  const raw = request.headers[requestIdHeader]
  const value = Array.isArray(raw) ? raw[0] : raw

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return safeRequestId.test(trimmed) ? trimmed : null
}
