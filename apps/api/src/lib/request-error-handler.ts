/**
 * The Express error handler (PLAT-15, LOG-6): logs a failed request once, then answers it in the
 * one error shape from `http-error.ts`.
 *
 * Only the path is logged, without its query string, which can carry OAuth codes. Anything the
 * server got wrong is an error, logged with its cause. A client mistake is a warning with only its
 * code, because a JSON parse error's message can quote the request body.
 *
 * When the response has already started (a stream or the event stream failing partway), no second
 * set of headers can be written, so the connection is closed here. The error is not handed on:
 * Express's default handler would print its raw stack to standard error, bypassing the logger's
 * redaction, and a Prisma validation error's stack quotes the query's values.
 */
import type { NextFunction, Request, Response } from 'express'
import { describeRequestFailure, sendError } from './http-error.js'
import { logger } from './logger.js'

export function handleRequestError(
  error: unknown,
  request: Request,
  response: Response,
  // Express recognises an error handler by its four parameters, so this one stays though unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const failure = describeRequestFailure(error)
  const where = { method: request.method, path: request.path }

  if (failure.statusCode >= 500) {
    logger.error('Request failed', { ...where, error })
  } else {
    logger.warn('Request rejected', { ...where, code: failure.code })
  }

  if (response.headersSent) {
    response.destroy()
    return
  }

  sendError(response, failure.statusCode, failure.message, failure.code)
}
