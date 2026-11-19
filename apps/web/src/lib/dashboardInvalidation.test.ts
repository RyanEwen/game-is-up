/** Unit tests for which dashboard queries a server-sent invalidation event refreshes. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dashboardResourceKeys,
  invalidationKeysForDomains,
  invalidationPrefixesForDomains,
} from './dashboardInvalidation'

const keyNames = (keys: readonly (readonly unknown[])[]) =>
  keys.map((key) => key.join('/'))

test('auth and unknown domains refresh every dashboard resource', () => {
  const everything = keyNames(Object.values(dashboardResourceKeys))
  assert.deepEqual(keyNames(invalidationKeysForDomains(['auth'])), everything)
  assert.deepEqual(
    keyNames(invalidationKeysForDomains(['something-new'])),
    everything,
    'a newer server than this page must not leave the page stale',
  )
})

test('each domain refreshes what depends on it, and nothing for no domains', () => {
  assert.deepEqual(keyNames(invalidationKeysForDomains(['play-intents'])), [
    'play-intents/feed',
    'play-intents/current',
    'debug/admin',
  ])
  assert.deepEqual(keyNames(invalidationKeysForDomains(['library'])), [
    'discovery/feed',
    'play-intents/feed',
    'play-intents/current',
    'library/me',
    'debug/admin',
  ])
  assert.deepEqual(keyNames(invalidationKeysForDomains(['network'])), [
    'discovery/feed',
    'play-intents/feed',
    'friends-lists',
    'discord-servers/me',
    'debug/admin',
  ])
  assert.deepEqual(invalidationKeysForDomains([]), [])
})

test('overlapping domains list each key once', () => {
  const keys = keyNames(
    invalidationKeysForDomains(['discovery', 'library', 'discovery']),
  )
  assert.equal(new Set(keys).size, keys.length)
})

test('call-to-play detail pages refresh on play-intent, auth and unknown domains only', () => {
  const detail = [['play-intents', 'detail']]
  assert.deepEqual(invalidationPrefixesForDomains(['play-intents']), detail)
  assert.deepEqual(invalidationPrefixesForDomains(['auth']), detail)
  assert.deepEqual(invalidationPrefixesForDomains(['something-new']), detail)
  assert.deepEqual(invalidationPrefixesForDomains(['library']), [])
  assert.deepEqual(invalidationPrefixesForDomains([]), [])
})
