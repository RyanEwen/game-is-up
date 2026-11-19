/**
 * Unit tests for what the web app lets reach Umami: no query strings or hashes, identifying path
 * segments replaced, referrers cleaned, and a tracker tag with every privacy setting on.
 */
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../test-utils/jsdom'

let dom: JSDOM
let analytics: typeof import('./analytics')

before(async () => {
  dom = installJsdomGlobals()
  analytics = await import('./analytics')
})

after(() => {
  dom.window.close()
})

const callId = '3f2b6c1e-8d4a-4f6b-9c2e-1a7b5d9e0f42'

test('a call to play URL is tracked without its id, query or hash', () => {
  assert.equal(
    analytics.sanitizeTrackedUrl(
      `https://gamesup.app/play/${callId}?invite=abc123#details`,
    ),
    'https://gamesup.app/play/:id',
  )
  assert.equal(analytics.sanitizeTrackedUrl(`/play/${callId}`), '/play/:id')
})

test('invite and sign-in parameters never survive, and plain routes are unchanged', () => {
  assert.equal(
    analytics.sanitizeTrackedUrl(
      '/invite?inviter=123456789012345678&server=987654321098765432&kind=hub',
    ),
    '/invite',
  )
  assert.equal(analytics.sanitizeTrackedUrl('/?auth=discord&status=error'), '/')
  assert.equal(analytics.sanitizeTrackedUrl('/library'), '/library')
  assert.equal(analytics.sanitizeTrackedUrl('/'), '/')
})

test('long numbers and tokens in a path are replaced too', () => {
  assert.equal(
    analytics.sanitizeTrackedUrl('/x/123456789012345678/y'),
    '/x/:id/y',
  )
  assert.equal(
    analytics.sanitizeTrackedUrl('/t/AbCdEfGhIjKlMnOpQrStUvWx'),
    '/t/:id',
  )
})

test('the before-send hook cleans the URL and the referrer and keeps the rest', () => {
  assert.deepEqual(
    analytics.sanitizeTrackedPayload('event', {
      website: 'site',
      url: `/play/${callId}?x=1`,
      referrer:
        'https://discord.com/channels/123456789012345678/987654321098765432?foo=bar',
      title: "Friday raid night \u2022 Game's Up",
    }),
    {
      website: 'site',
      url: '/play/:id',
      referrer: 'https://discord.com/channels/:id/:id',
      title: "Game's Up",
    },
  )
})

test('the tracker tag carries every privacy setting', () => {
  const script = analytics.buildTrackerScript({
    scriptUrl: 'https://analytics.example.test/script.js',
    websiteId: '33333333-3333-4333-8333-333333333333',
    domains: ['gamesup.app'],
  })

  assert.equal(script.src, 'https://analytics.example.test/script.js')
  assert.equal(script.defer, true)
  assert.deepEqual(
    {
      websiteId: script.dataset.websiteId,
      domains: script.dataset.domains,
      excludeSearch: script.dataset.excludeSearch,
      excludeHash: script.dataset.excludeHash,
      doNotTrack: script.dataset.doNotTrack,
      beforeSend: script.dataset.beforeSend,
    },
    {
      websiteId: '33333333-3333-4333-8333-333333333333',
      domains: 'gamesup.app',
      excludeSearch: 'true',
      excludeHash: 'true',
      doNotTrack: 'true',
      beforeSend: 'gamesUpAnalyticsBeforeSend',
    },
  )
})

test("only the app's fixed page titles are tracked; a call's own title never is", () => {
  assert.equal(
    analytics.sanitizeTrackedTitle("Game's Up \u2022 Library"),
    "Game's Up \u2022 Library",
  )
  assert.equal(analytics.sanitizeTrackedTitle("Game's Up"), "Game's Up")
  assert.equal(
    analytics.sanitizeTrackedTitle("Game's Up \u2022 Invite Accepted"),
    "Game's Up \u2022 Invite Accepted",
  )
  assert.equal(
    analytics.sanitizeTrackedTitle("Late-night Helldivers \u2022 Game's Up"),
    "Game's Up",
  )
  assert.equal(
    analytics.sanitizeTrackedTitle("Game's Up \u2022 Somebody's private call"),
    "Game's Up",
  )
})
