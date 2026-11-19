/**
 * Unit tests for the analytics settings: off unless both Umami values are set, limited to the
 * public host, and the CSP allows only the tracker's origin.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsCspSources, getClientAnalyticsConfig } from './analytics.js'

const websiteId = '33333333-3333-4333-8333-333333333333'
const base = { CLIENT_ORIGIN: 'https://gamesup.app' }

test('analytics is off unless both the script URL and the website id are set', () => {
  assert.equal(getClientAnalyticsConfig(base), null)
  assert.equal(
    getClientAnalyticsConfig({
      ...base,
      UMAMI_SCRIPT_URL: 'https://analytics.example.test/script.js',
    }),
    null,
  )
  assert.equal(
    getClientAnalyticsConfig({ ...base, UMAMI_WEBSITE_ID: websiteId }),
    null,
  )
  assert.deepEqual(analyticsCspSources(base), [])
})

test('when on, it tracks only the public host and the CSP allows only the tracker origin', () => {
  const environment = {
    ...base,
    UMAMI_SCRIPT_URL: 'https://analytics.example.test/script.js',
    UMAMI_WEBSITE_ID: websiteId,
  }

  assert.deepEqual(getClientAnalyticsConfig(environment), {
    scriptUrl: 'https://analytics.example.test/script.js',
    websiteId,
    domains: ['gamesup.app'],
  })
  assert.deepEqual(analyticsCspSources(environment), [
    'https://analytics.example.test',
  ])
})
