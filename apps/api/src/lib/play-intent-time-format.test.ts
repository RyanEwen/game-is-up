import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatPlayIntentDateLabel,
  formatPlayIntentDurationLabel,
  formatPlayIntentTimeLabel,
  formatPlayIntentWindowLabel,
} from './play-intent-time-format.js'

test('formatPlayIntentDurationLabel uses singular hour for 60 minutes', () => {
  assert.equal(formatPlayIntentDurationLabel(60), '1 hour')
})

test('formatPlayIntentDurationLabel pluralises hours when divisible by 60', () => {
  assert.equal(formatPlayIntentDurationLabel(120), '2 hours')
  assert.equal(formatPlayIntentDurationLabel(240), '4 hours')
  assert.equal(formatPlayIntentDurationLabel(1440), '24 hours')
})

test('formatPlayIntentDurationLabel falls back to minutes when not hour-aligned', () => {
  assert.equal(formatPlayIntentDurationLabel(15), '15 minutes')
  assert.equal(formatPlayIntentDurationLabel(45), '45 minutes')
  assert.equal(formatPlayIntentDurationLabel(90), '90 minutes')
})

test('formatPlayIntentDateLabel uses an English ordinal day suffix', () => {
  // 2026-04-01T17:00 UTC = noon EST.
  const date = new Date('2026-04-01T17:00:00.000Z')

  assert.match(
    formatPlayIntentDateLabel(date, 'America/New_York'),
    /Apr 1st at 1(:00)?pm$/,
  )
})

test('formatPlayIntentDateLabel handles the special 11th/12th/13th teen suffix', () => {
  for (const day of [11, 12, 13]) {
    const date = new Date(
      `2026-05-${String(day).padStart(2, '0')}T17:00:00.000Z`,
    )

    assert.match(
      formatPlayIntentDateLabel(date, 'America/New_York'),
      new RegExp(`May ${day}th`),
    )
  }
})

test('formatPlayIntentDateLabel uses st/nd/rd/th suffixes for non-teen days', () => {
  const cases: Array<[number, string]> = [
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [31, '31st'],
  ]

  for (const [day, expectedSuffix] of cases) {
    const date = new Date(
      `2026-05-${String(day).padStart(2, '0')}T17:00:00.000Z`,
    )

    assert.match(
      formatPlayIntentDateLabel(date, 'America/New_York'),
      new RegExp(`May ${expectedSuffix}`),
    )
  }
})

test('formatPlayIntentDateLabel falls back to UTC when the timezone is missing or invalid', () => {
  const date = new Date('2026-04-01T20:30:00.000Z')

  // 2026-04-01 is a Wednesday at 20:30 UTC.
  assert.match(
    formatPlayIntentDateLabel(date, null),
    /^Wednesday Apr 1st at 8:30pm$/,
  )
  assert.match(
    formatPlayIntentDateLabel(date, 'Not/A_Real_Zone'),
    /^Wednesday Apr 1st at 8:30pm$/,
  )
})

test('formatPlayIntentDateLabel collapses :00 minutes from the rendered time', () => {
  const date = new Date('2026-04-01T17:00:00.000Z')

  assert.match(formatPlayIntentDateLabel(date, 'Etc/UTC'), /at 5pm$/)
})

test('formatPlayIntentTimeLabel renders a compact localized time label', () => {
  const date = new Date('2026-04-01T20:30:00.000Z')

  assert.equal(formatPlayIntentTimeLabel(date, 'Etc/UTC'), '8:30pm')
  assert.equal(
    formatPlayIntentTimeLabel(new Date('2026-04-01T17:00:00.000Z'), 'Etc/UTC'),
    '5pm',
  )
})

test('formatPlayIntentWindowLabel combines the date label with a duration label', () => {
  const startsAt = new Date('2026-04-01T20:00:00.000Z')
  const endsAt = new Date('2026-04-01T22:00:00.000Z')

  assert.equal(
    formatPlayIntentWindowLabel(startsAt, endsAt, 'Etc/UTC'),
    'Wednesday Apr 1st at 8pm, for 2 hours',
  )
})

test('formatPlayIntentWindowLabel rounds the rendered duration to the nearest minute', () => {
  const startsAt = new Date('2026-04-01T20:00:00.000Z')
  const endsAtJustOver = new Date('2026-04-01T20:14:30.000Z')

  assert.match(
    formatPlayIntentWindowLabel(startsAt, endsAtJustOver, 'Etc/UTC'),
    /, for 15 minutes$/,
  )
})
