/**
 * The API's one error shape (PLAT-15): every failed request answers with `ApiErrorResponse`,
 * `{ error, code, requestId }`, where `error` is safe public copy (never an upstream payload or a
 * secret), `code` is stable for clients and `requestId` matches the server's log lines.
 *
 * Routes either throw `HttpError` (the error handler in `app.ts` answers) or call `sendError`
 * directly. The code defaults from the status, so most callers pass only a status and a message.
 */
import type { Response } from 'express'
import type { ApiErrorResponse } from '@game-is-up/shared'
import { getRequestId } from './request-context.js'

/** The code a status answers with when the caller does not name a more specific one. */
const defaultCodeByStatus: Record<number, string> = {
  400: 'invalid_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
  500: 'internal_error',
  502: 'upstream_failed',
  503: 'unavailable',
}

/** A failure with a status and a message that is safe to show the user. */
export class HttpError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code ?? defaultCodeFor(statusCode)
  }
}

/** The default code for a status: its own, or the generic one for its class. */
export function defaultCodeFor(statusCode: number): string {
  return (
    defaultCodeByStatus[statusCode] ??
    (statusCode >= 500 ? 'internal_error' : 'request_failed')
  )
}

/**
 * The status, public message and code for an error that reached the error handler: an
 * `HttpError` answers as itself; a body-parser rejection (malformed JSON, an oversized body) is
 * the client's 4xx rather than a 500; anything else is an internal error whose details stay in
 * the log.
 */
export function describeRequestFailure(error: unknown): {
  statusCode: number
  message: string
  code: string
} {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
    }
  }

  const parserError = error as { type?: unknown; status?: unknown }
  if (parserError?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      message: 'The request body is not valid JSON.',
      code: 'invalid_json',
    }
  }
  if (parserError?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      message: 'The request body is too large.',
      code: defaultCodeFor(413),
    }
  }
  if (
    typeof parserError?.status === 'number' &&
    parserError.status >= 400 &&
    parserError.status < 500
  ) {
    return {
      statusCode: parserError.status,
      message: 'The request could not be read.',
      code: defaultCodeFor(parserError.status),
    }
  }

  return {
    statusCode: 500,
    message: 'Internal server error',
    code: defaultCodeFor(500),
  }
}

/** The error body for a message and code, with the current request id when there is one. */
export function errorBody(message: string, code: string): ApiErrorResponse {
  const requestId = getRequestId()
  return requestId
    ? { error: message, code, requestId }
    : { error: message, code }
}

/**
 * Answer the request with the error shape.
 * @param statusCode The HTTP status, 400 or above.
 * @param message Public copy shown to the user.
 * @param code A stable code; defaults from the status.
 */
export function sendError(
  response: Response,
  statusCode: number,
  message: string,
  code: string = defaultCodeFor(statusCode),
): void {
  response.status(statusCode).json(errorBody(message, code))
}
