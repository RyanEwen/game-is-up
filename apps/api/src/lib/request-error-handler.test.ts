/**
 * Unit tests for the Express error handler: a failure answers in the error shape, one that
 * happens after the response has started closes the connection instead of writing headers twice,
 * and a Prisma error's query values never reach the console.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from './http-error.js'
import { handleRequestError } from './request-error-handler.js'

const request = { method: 'GET', path: '/api/events' } as Request

/** A response stand-in recording what the handler wrote; `headersSent` as given. */
function fakeResponse(headersSent: boolean) {
  const written: { status?: number; body?: unknown; destroyed?: boolean } = {}
  const response = {
    headersSent,
    destroy() {
      written.destroyed = true
      return response
    },
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

test('a failure after the response started is logged and the connection closed, not answered again', (context) => {
  const logged = context.mock.method(console, 'error', () => {})
  const { response, written } = fakeResponse(true)
  const next = context.mock.fn()

  handleRequestError(
    new Error('stream broke'),
    request,
    response,
    next as unknown as NextFunction,
  )

  assert.equal(logged.mock.callCount(), 1)
  assert.equal(written.status, undefined)
  assert.equal(written.body, undefined)
  assert.equal(written.destroyed, true)
  // Express's default handler would print the raw stack, so the error is not handed on.
  assert.equal(next.mock.callCount(), 0)
})

test('a Prisma validation error never puts its query values on the console', (context) => {
  const planted = 'planted-value-4417'
  const printed: string[] = []
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    context.mock.method(console, method, (...args: unknown[]) => {
      printed.push(args.map(String).join(' '))
    })
  }
  class PrismaClientValidationError extends Error {
    override name = 'PrismaClientValidationError'
  }
  const failure = new PrismaClientValidationError(
    `\nInvalid \`prisma.user.create()\` invocation:\n\n{\n  data: {\n    username: "${planted}",\n    notAField: "${planted}"\n  }\n}\n\nUnknown argument \`notAField\`.`,
  )

  for (const headersSent of [false, true]) {
    const { response } = fakeResponse(headersSent)
    handleRequestError(
      failure,
      request,
      response,
      context.mock.fn() as unknown as NextFunction,
    )
  }

  assert.equal(printed.length, 2)
  assert.equal(printed.join('\n').split(planted).length - 1, 0)
})
