import assert from 'node:assert/strict'
import test from 'node:test'

import { formatTimezoneLabel, normalizeTimezoneId } from './timezone-label.js'

test('normalizeTimezoneId returns null for missing or whitespace input', () => {
  assert.equal(normalizeTimezoneId(null), null)
  assert.equal(normalizeTimezoneId(undefined), null)
  assert.equal(normalizeTimezoneId(''), null)
  assert.equal(normalizeTimezoneId('   '), null)
})

test('normalizeTimezoneId trims surrounding whitespace before mapping', () => {
  assert.equal(normalizeTimezoneId('  America/New_York  '), 'America/New_York')
})

test('normalizeTimezoneId maps legacy UTC and GMT aliases case-insensitively', () => {
  // Intl canonicalises Etc/UTC back to "UTC" on modern Node — accept either form
  // here so the test stays stable across runtimes.
  assert.match(normalizeTimezoneId('UTC') ?? '', /^(UTC|Etc\/UTC)$/)
  assert.match(normalizeTimezoneId('utc') ?? '', /^(UTC|Etc\/UTC)$/)
  assert.match(normalizeTimezoneId('GMT') ?? '', /^(UTC|Etc\/UTC)$/)
  assert.equal(normalizeTimezoneId('gmt-5'), 'America/New_York')
  // Older ICU canonicalises Asia/Kolkata to Asia/Calcutta — accept either.
  assert.match(normalizeTimezoneId('UTC+5:30') ?? '', /^Asia\/(Kolkata|Calcutta)$/)
})

test('normalizeTimezoneId returns null for unrecognized identifiers', () => {
  assert.equal(normalizeTimezoneId('Not/A_Real_Zone'), null)
  assert.equal(normalizeTimezoneId('UTC+99'), null)
})

test('normalizeTimezoneId passes valid IANA ids through unchanged', () => {
  assert.equal(normalizeTimezoneId('America/Los_Angeles'), 'America/Los_Angeles')
  assert.equal(normalizeTimezoneId('Europe/Helsinki'), 'Europe/Helsinki')
  assert.equal(normalizeTimezoneId('Asia/Tokyo'), 'Asia/Tokyo')
})

test('formatTimezoneLabel returns UTC for the canonical UTC timezone', () => {
  assert.equal(formatTimezoneLabel('Etc/UTC'), 'UTC')
  assert.equal(formatTimezoneLabel('UTC'), 'UTC')
})

test('formatTimezoneLabel returns a non-empty short timezone label for a real zone', () => {
  // Don't pin the exact short name (e.g. EST vs EDT depends on the current
  // date) — just guarantee the function returns a non-empty label.
  const label = formatTimezoneLabel('America/New_York')

  assert.ok(label.length > 0)
})

test('formatTimezoneLabel falls back to UTC when the timezone is missing or invalid', () => {
  assert.equal(formatTimezoneLabel(null), 'UTC')
  assert.equal(formatTimezoneLabel(undefined), 'UTC')
  assert.equal(formatTimezoneLabel('Not/A_Real_Zone'), 'UTC')
})
