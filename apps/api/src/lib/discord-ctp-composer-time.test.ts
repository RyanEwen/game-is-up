import assert from 'node:assert/strict'
import test from 'node:test'

import { parseComposerDurationInput, parseComposerStartInput } from './discord-ctp-composer-time.js'

// 2026-07-12 15:00:00 UTC = 11:00 in Toronto (EDT, UTC-4).
const torontoNow = new Date('2026-07-12T15:00:00.000Z')
const toronto = 'America/Toronto'

function scheduledIso(result: ReturnType<typeof parseComposerStartInput>) {
  assert.equal(result.kind, 'scheduled')
  return result.kind === 'scheduled' ? result.startAt.toISOString() : ''
}

test('"now" and zero offsets resolve to an immediate start', () => {
  assert.deepEqual(parseComposerStartInput('now', toronto, torontoNow), { kind: 'now' })
  assert.deepEqual(parseComposerStartInput(' ASAP ', toronto, torontoNow), { kind: 'now' })
})

test('relative offsets are applied against the provided now', () => {
  assert.equal(scheduledIso(parseComposerStartInput('in 45m', toronto, torontoNow)), '2026-07-12T15:45:00.000Z')
  assert.equal(scheduledIso(parseComposerStartInput('in 1h30m', toronto, torontoNow)), '2026-07-12T16:30:00.000Z')
  assert.equal(scheduledIso(parseComposerStartInput('+2h', toronto, torontoNow)), '2026-07-12T17:00:00.000Z')
})

test('bare future times resolve to today in the user timezone', () => {
  // 8pm Toronto on 2026-07-12 is 00:00 UTC the next day.
  assert.equal(scheduledIso(parseComposerStartInput('8pm', toronto, torontoNow)), '2026-07-13T00:00:00.000Z')
  assert.equal(scheduledIso(parseComposerStartInput('20:00', toronto, torontoNow)), '2026-07-13T00:00:00.000Z')
})

test('bare times that already passed roll forward to tomorrow', () => {
  // 9am Toronto has passed at 11am local, so it means tomorrow 9am.
  assert.equal(scheduledIso(parseComposerStartInput('9am', toronto, torontoNow)), '2026-07-13T13:00:00.000Z')
})

test('day prefixes and explicit dates are honored', () => {
  assert.equal(scheduledIso(parseComposerStartInput('tomorrow 9:30am', toronto, torontoNow)), '2026-07-13T13:30:00.000Z')
  assert.equal(scheduledIso(parseComposerStartInput('2026-07-15 20:00', toronto, torontoNow)), '2026-07-16T00:00:00.000Z')
})

test('explicit past times are rejected instead of rolling forward', () => {
  const result = parseComposerStartInput('today 9am', toronto, torontoNow)
  assert.equal(result.kind, 'error')

  const pastDate = parseComposerStartInput('2026-07-01 20:00', toronto, torontoNow)
  assert.equal(pastDate.kind, 'error')
})

test('unreadable start input returns a format hint', () => {
  const result = parseComposerStartInput('whenever', toronto, torontoNow)
  assert.equal(result.kind, 'error')
  assert.match(result.kind === 'error' ? result.error : '', /formats like/)
})

test('unknown timezones fall back to UTC instead of throwing', () => {
  assert.equal(scheduledIso(parseComposerStartInput('20:00', 'Not/AZone', torontoNow)), '2026-07-12T20:00:00.000Z')
})

test('winter dates use the standard-time offset', () => {
  // 2026-12-01 is EST (UTC-5).
  const winterNow = new Date('2026-11-30T15:00:00.000Z')
  assert.equal(scheduledIso(parseComposerStartInput('2026-12-01 20:00', toronto, winterNow)), '2026-12-02T01:00:00.000Z')
})

test('duration inputs accept minutes and hour forms', () => {
  assert.deepEqual(parseComposerDurationInput('90'), { minutes: 90 })
  assert.deepEqual(parseComposerDurationInput('90m'), { minutes: 90 })
  assert.deepEqual(parseComposerDurationInput('2h'), { minutes: 120 })
  assert.deepEqual(parseComposerDurationInput('1h30m'), { minutes: 90 })
  assert.deepEqual(parseComposerDurationInput('1.5h'), { minutes: 90 })
})

test('unreadable durations return a format hint', () => {
  const result = parseComposerDurationInput('a while')
  assert.ok('error' in result)
})
