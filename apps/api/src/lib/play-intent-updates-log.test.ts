import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlayIntentUpdatesLogContent, buildPlayIntentUpdatesLogEntry } from './play-intent-updates-log.js'

test('log content lists entries newest first as plain lines with the title emoji and timestamp', () => {
  const content = buildPlayIntentUpdatesLogContent({
    headline: 'Friday Night Helldivers',
    entries: [
      { title: '⏰ Someone is running late', body: 'Sam is interested but running late for Helldivers 2.', timestampLabel: 'Fri 7:20pm' },
      { title: '✅ Someone is interested', body: 'Alex is interested in playing Helldivers 2.', timestampLabel: 'Fri 7:05pm' }
    ]
  })

  assert.equal(content, [
    '📣 Updates — Friday Night Helldivers',
    [
      '⏰ Fri 7:20pm — Sam is interested but running late for Helldivers 2.',
      '✅ Fri 7:05pm — Alex is interested in playing Helldivers 2.'
    ].join('\n')
  ].join('\n\n'))
})

test('log content falls back to a generic heading without a custom headline', () => {
  for (const headline of [null, undefined, '', '  ', 'Call to play']) {
    const content = buildPlayIntentUpdatesLogContent({
      headline,
      entries: [
        { title: '✅ Someone is interested', body: 'Alex is interested in your call to play.' }
      ]
    })

    assert.match(content, /^📣 Call to Play Updates\n/)
  }
})

test('log entries without a title emoji render the body alone', () => {
  const content = buildPlayIntentUpdatesLogContent({
    entries: [
      { title: 'Creator launched the game', body: 'Ryan just launched Helldivers 2 for this call to play.' }
    ]
  })

  assert.match(content, /\n\nRyan just launched Helldivers 2 for this call to play\.$/)
})

test('log content never contains Discord mention or subtext markup', () => {
  const content = buildPlayIntentUpdatesLogContent({
    headline: 'Squad night',
    entries: [
      { title: '✅ Someone is interested', body: 'Alex is interested in playing Helldivers 2.', timestampLabel: 'Sat 2:00pm' },
      { title: '🎙 Someone joined the voice channel', body: 'Sam just joined the voice channel squad-up for this call to play.', timestampLabel: 'Sat 2:10pm' }
    ],
    showRespondCallToAction: true
  })

  assert.doesNotMatch(content, /<@/)
  assert.doesNotMatch(content, /-#/)
})

test('log content collapses multi-line bodies into a single entry line', () => {
  const content = buildPlayIntentUpdatesLogContent({
    entries: [
      { title: '✅ Someone is interested', body: 'Alex is interested.\nMore detail here.' }
    ]
  })

  assert.match(content, /✅ Alex is interested\. More detail here\./)
})

test('log content caps rendered entries and summarizes the rest', () => {
  const entries = Array.from({ length: 15 }, (_, index) => ({
    title: '✅ Someone is interested',
    body: `Player ${index + 1} is interested in your call to play.`
  }))

  const content = buildPlayIntentUpdatesLogContent({ entries })

  assert.match(content, /Player 1 is interested/)
  assert.match(content, /Player 12 is interested/)
  assert.doesNotMatch(content, /Player 13 is interested/)
  assert.match(content, /…and 3 earlier updates\.$/)
})

test('log content appends the respond call-to-action for recipients with a pending invite', () => {
  const content = buildPlayIntentUpdatesLogContent({
    entries: [
      { title: '✅ Someone is interested', body: 'Alex is interested in your call to play.' }
    ],
    showRespondCallToAction: true
  })

  assert.match(content, /You haven't responded yet — tap "I'm interested" or "Can't make it" on your invite above\. Saying you can't make it stops these updates\.$/)
})

test('log content keeps both the hidden-entry summary and the call-to-action in the footer', () => {
  const entries = Array.from({ length: 13 }, (_, index) => ({
    title: '✅ Someone is interested',
    body: `Player ${index + 1} is interested in your call to play.`
  }))

  const content = buildPlayIntentUpdatesLogContent({ entries, showRespondCallToAction: true })

  assert.match(content, /…and 1 earlier update\.\nYou haven't responded yet/)
})

test('log entries render row timestamps in the recipient timezone', () => {
  const entry = buildPlayIntentUpdatesLogEntry(
    { title: '✅ Someone is interested', body: 'Alex is interested.', createdAt: new Date('2026-07-10T23:05:00Z') },
    'America/Toronto'
  )

  assert.equal(entry.timestampLabel, 'Fri 7:05pm')
})
