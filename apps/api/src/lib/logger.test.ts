/**
 * Unit tests for the API logger: the line shape, the request id inside a request, and what an
 * error is reduced to (LOG-6: library errors' URLs and bodies never reach the log).
 */
import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { logger } from './logger.js'
import { getRequestId, requestContext } from './request-context.js'

/** Capture what the logger writes to each console stream. */
function captureConsole(context: TestContext) {
  const lines: { stream: string; line: string }[] = []
  for (const stream of ['log', 'warn', 'error'] as const) {
    context.mock.method(console, stream, (line: string) => {
      lines.push({ stream, line })
    })
  }
  return lines
}

/** Run `callback` inside the request-context middleware, as a request handler would. */
function withinRequest(headers: Record<string, string>, callback: () => void) {
  const responseHeaders: Record<string, string> = {}
  const response = {
    setHeader: (name: string, value: string) => {
      responseHeaders[name] = value
    },
  } as unknown as Response
  requestContext()({ headers } as Request, response, (() =>
    callback()) as NextFunction)
  return responseHeaders
}

test('a line is the level and message, then the fields as JSON', (context) => {
  const lines = captureConsole(context)

  logger.info('Started')
  logger.warn('Slow', { ms: 1200 })
  logger.error('Failed', { spaceId: 'space-1' })

  assert.deepEqual(lines, [
    { stream: 'log', line: '[info] Started' },
    { stream: 'warn', line: '[warn] Slow {"ms":1200}' },
    { stream: 'error', line: '[error] Failed {"spaceId":"space-1"}' },
  ])
})

test('inside a request every line carries the request id, which is echoed back', (context) => {
  const lines = captureConsole(context)

  const headers = withinRequest({}, () => {
    logger.info('Handling')
  })

  const requestId = headers['X-Request-Id']
  assert.ok(requestId)
  assert.equal(lines[0]!.line, `[info] Handling {"requestId":"${requestId}"}`)
  assert.equal(getRequestId(), null, 'no request id outside the request')
})

test('a safe inbound request id is kept and an unsafe one replaced', () => {
  let seen: string | null = null
  withinRequest({ 'x-request-id': 'edge-123' }, () => {
    seen = getRequestId()
  })
  assert.equal(seen, 'edge-123')

  withinRequest({ 'x-request-id': 'bad id\nwith newline' }, () => {
    seen = getRequestId()
  })
  assert.notEqual(seen, 'bad id\nwith newline')
  assert.match(seen ?? '', /^[0-9a-f-]{36}$/)
})

test('an error keeps its name, message, code, stack and cause, and nothing else', (context) => {
  const lines = captureConsole(context)
  const cause = new Error('socket hang up')
  const error = Object.assign(new Error('Unknown Message', { cause }), {
    code: 10008,
    url: 'https://discord.com/api/interactions/1/secret-token/callback',
    requestBody: { content: 'what the user typed' },
  })

  logger.error('Discord call failed', { nested: { error } })

  const fields = JSON.parse(lines[0]!.line.replace(/^\[error\] [^{]+/, ''))
  const logged = fields.nested.error
  assert.equal(logged.name, 'Error')
  assert.equal(logged.message, 'Unknown Message')
  assert.equal(logged.code, 10008)
  assert.ok(logged.stack)
  assert.equal(logged.cause.message, 'socket hang up')
  assert.equal(logged.url, undefined)
  assert.equal(logged.requestBody, undefined)
  assert.doesNotMatch(lines[0]!.line, /secret-token|what the user typed/)
})

test('repeated objects and bigints do not make logging throw', (context) => {
  const lines = captureConsole(context)
  const shared: Record<string, unknown> = { id: 'a' }
  shared.self = shared

  logger.info('Odd fields', { shared, count: 12n })

  assert.match(lines[0]!.line, /"self":"\[repeated\]"/)
  assert.match(lines[0]!.line, /"count":"12"/)
})

test('a Prisma validation error logs a fixed message and no query values', (context) => {
  const lines = captureConsole(context)
  class PrismaClientValidationError extends Error {
    override name = 'PrismaClientValidationError'
  }
  const error = new PrismaClientValidationError(
    'Invalid `prisma.user.update()` invocation:\n  data: { displayName: "private value" }',
  )

  logger.error('Save failed', { error })

  const logged = JSON.parse(
    lines[0]!.line.replace(/^\[error\] [^{]+/, ''),
  ).error
  assert.equal(logged.name, 'PrismaClientValidationError')
  assert.equal(logged.message, 'invalid query arguments')
  assert.match(logged.stack, /^\s*at /)
  assert.doesNotMatch(lines[0]!.line, /private value|prisma\.user/)
})
