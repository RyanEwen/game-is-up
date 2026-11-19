/**
 * Unit tests for the Express error handler: a failure answers in the error shape, and one that
 * happens after the response has started is handed on instead of writing headers twice.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from './http-error.js'
import { handleRequestError } from './request-error-handler.js'

const request = { method: 'GET', path: '/api/events' } as Request

/** A response stand-in recording what the handler wrote; `headersSent` as given. */
function fakeResponse(headersSent: boolean) {
  const written: { status?: number; body?: unknown } = {}
  const response = {
    headersSent,
    status(code: number) {
      written.status = code
      return response
    },
    json(body: unknown) {
      written.body = body
      return response
    },
  }
  return { response: response as unknown as Response, written }
}

test('a failure before the response started answers in the error shape', (context) => {
  context.mock.method(console, 'warn', () => {})
  const { response, written } = fakeResponse(false)
  const next = context.mock.fn()

  handleRequestError(
    new HttpError(404, 'Not here.'),
    request,
    response,
    next as unknown as NextFunction,
  )

  assert.equal(written.status, 404)
  assert.deepEqual(written.body, { error: 'Not here.', code: 'not_found' })
  assert.equal(next.mock.callCount(), 0)
})

test('a failure after the response started is logged and handed on, not answered again', (context) => {
  const logged = context.mock.method(console, 'error', () => {})
  const { response, written } = fakeResponse(true)
  const next = context.mock.fn()
  const failure = new Error('stream broke')

  handleRequestError(
    failure,
    request,
    response,
    next as unknown as NextFunction,
  )

  assert.equal(logged.mock.callCount(), 1)
  assert.equal(written.status, undefined)
  assert.equal(written.body, undefined)
  assert.equal(next.mock.callCount(), 1)
  assert.equal(next.mock.calls[0]!.arguments[0], failure)
})
