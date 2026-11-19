import assert from 'node:assert/strict'
import test from 'node:test'

import type { Request, Response } from 'express'
import { createMediaHandler, type MediaPayload } from './media-handler.js'

type CapturedResponse = {
  statusCode: number
  jsonBody: unknown
  headers: Record<string, string>
  type: string | null
  sent: unknown
  ended: boolean
}

function buildFakeResponse(): {
  response: Response
  captured: CapturedResponse
} {
  const captured: CapturedResponse = {
    statusCode: 200,
    jsonBody: undefined,
    headers: {},
    type: null,
    sent: undefined,
    ended: false,
  }
  const response = {
    status(code: number) {
      captured.statusCode = code
      return this
    },
    json(body: unknown) {
      captured.jsonBody = body
      return this
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value
      return this
    },
    type(value: string) {
      captured.type = value
      return this
    },
    send(body: unknown) {
      captured.sent = body
      return this
    },
    end() {
      captured.ended = true
      return this
    },
  } as unknown as Response

  return { response, captured }
}

function buildFakeRequest(token: string, ifNoneMatch?: string): Request {
  return {
    params: { token },
    headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {},
  } as unknown as Request
}

const samplePayload: MediaPayload = {
  body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  contentType: 'image/png',
  etag: 'abc123',
  lastModified: 'Wed, 22 Apr 2026 12:00:00 GMT',
}

test('serves the media body with cache headers when fetched', async () => {
  const handler = createMediaHandler({
    fetcher: async () => samplePayload,
    cacheControl: 'public, max-age=60',
    notFoundMessage: 'Not found.',
  })
  const { response, captured } = buildFakeResponse()
  const next = () =>
    assert.fail('next should not be called on the success path')

  await handler(buildFakeRequest('valid-token'), response, next)

  assert.equal(captured.statusCode, 200)
  assert.equal(captured.type, 'image/png')
  assert.equal(captured.sent, samplePayload.body)
  assert.equal(captured.headers['Cache-Control'], 'public, max-age=60')
  assert.equal(captured.headers['ETag'], '"abc123"')
  assert.equal(captured.headers['Last-Modified'], samplePayload.lastModified)
  assert.equal(captured.headers['Cross-Origin-Resource-Policy'], 'cross-origin')
})

test('returns 404 with the configured message when the fetcher returns null', async () => {
  const handler = createMediaHandler({
    fetcher: async () => null,
    cacheControl: 'public, max-age=60',
    notFoundMessage: 'Game cover not found.',
  })
  const { response, captured } = buildFakeResponse()

  await handler(buildFakeRequest('missing'), response, () => {})

  assert.equal(captured.statusCode, 404)
  assert.deepEqual(captured.jsonBody, {
    error: 'Game cover not found.',
    code: 'not_found',
  })
  assert.equal(captured.sent, undefined)
})

test('returns 304 when If-None-Match matches the current etag', async () => {
  const handler = createMediaHandler({
    fetcher: async () => samplePayload,
    cacheControl: 'public, max-age=60',
    notFoundMessage: 'Not found.',
  })
  const { response, captured } = buildFakeResponse()

  await handler(buildFakeRequest('valid-token', '"abc123"'), response, () => {})

  assert.equal(captured.statusCode, 304)
  assert.equal(captured.ended, true)
  assert.equal(captured.sent, undefined)
  // The etag and cache headers must still be set on a 304.
  assert.equal(captured.headers['ETag'], '"abc123"')
  assert.equal(captured.headers['Cache-Control'], 'public, max-age=60')
})

test('omits Last-Modified header when payload does not provide one', async () => {
  const handler = createMediaHandler({
    fetcher: async () => ({ ...samplePayload, lastModified: null }),
    cacheControl: 'public, max-age=60',
    notFoundMessage: 'Not found.',
  })
  const { response, captured } = buildFakeResponse()

  await handler(buildFakeRequest('valid-token'), response, () => {})

  assert.equal(captured.headers['Last-Modified'], undefined)
})

test('forwards fetcher errors to next() instead of crashing the response', async () => {
  const boom = new Error('catalog unreachable')
  const handler = createMediaHandler({
    fetcher: async () => {
      throw boom
    },
    cacheControl: 'public, max-age=60',
    notFoundMessage: 'Not found.',
  })
  const { response } = buildFakeResponse()
  let forwarded: unknown = null
  await handler(buildFakeRequest('valid-token'), response, (error) => {
    forwarded = error
  })

  assert.equal(forwarded, boom)
})

test('rejects empty tokens via zod validation forwarded to next()', async () => {
  const handler = createMediaHandler({
    fetcher: async () => samplePayload,
    cacheControl: 'public, max-age=60',
    notFoundMessage: 'Not found.',
  })
  const { response } = buildFakeResponse()
  let forwarded: unknown = null
  await handler(buildFakeRequest(''), response, (error) => {
    forwarded = error
  })

  assert.ok(forwarded, 'expected next() to receive a validation error')
})
