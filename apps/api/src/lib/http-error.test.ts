/**
 * Unit tests for the API's one error shape: the body, the default codes, the request id inside a
 * request, and how errors that reach the error handler are classified.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { apiErrorResponseSchema } from '@game-is-up/shared'
import {
  describeRequestFailure,
  errorBody,
  HttpError,
  sendError,
} from './http-error.js'
import { requestContext } from './request-context.js'

/** A response stand-in that records the status and JSON body. */
function fakeResponse() {
  const captured: { status?: number; body?: unknown } = {}
  const response = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code
      return response
    },
    json(body: unknown) {
      captured.body = body
      return response
    },
  }
  return { response: response as unknown as Response, captured }
}

test('an error body has the message, a code from the status, and matches the shared schema', () => {
  const { response, captured } = fakeResponse()

  sendError(response, 404, 'Call to play not found.')

  assert.equal(captured.status, 404)
  assert.deepEqual(captured.body, {
    error: 'Call to play not found.',
    code: 'not_found',
  })
  apiErrorResponseSchema.parse(captured.body)
})

test('a named code wins over the default, and unknown statuses fall back by class', () => {
  assert.equal(errorBody('Slow down.', 'rate_limited').code, 'rate_limited')
  assert.equal(new HttpError(418, 'Teapot.').code, 'request_failed')
  assert.equal(new HttpError(504, 'Timed out.').code, 'internal_error')
})

test('inside a request the body carries the request id the response header returns', () => {
  const { response, captured } = fakeResponse()
  const request = {
    headers: { 'x-request-id': 'trace-7' },
  } as unknown as Request

  requestContext()(request, response, (() => {
    sendError(response, 400, 'Invalid user ID.')
  }) as NextFunction)

  assert.deepEqual(captured.body, {
    error: 'Invalid user ID.',
    code: 'invalid_request',
    requestId: 'trace-7',
  })
})

test('the error handler answers malformed JSON with 400 and hides internal errors', () => {
  assert.deepEqual(
    describeRequestFailure(
      Object.assign(new SyntaxError('Unexpected token'), {
        type: 'entity.parse.failed',
        status: 400,
      }),
    ),
    {
      statusCode: 400,
      message: 'The request body is not valid JSON.',
      code: 'invalid_json',
    },
  )
  assert.equal(
    describeRequestFailure(
      Object.assign(new Error('too big'), { type: 'entity.too.large' }),
    ).statusCode,
    413,
  )
  assert.deepEqual(describeRequestFailure(new HttpError(403, 'Not yours.')), {
    statusCode: 403,
    message: 'Not yours.',
    code: 'forbidden',
  })
  assert.deepEqual(
    describeRequestFailure(new Error('connection string with a password')),
    {
      statusCode: 500,
      message: 'Internal server error',
      code: 'internal_error',
    },
  )
})
