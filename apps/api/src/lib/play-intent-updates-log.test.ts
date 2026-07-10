import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlayIntentUpdatesLogContent } from './play-intent-updates-log.js'

test('log content lists entries newest first as subtext lines with the title emoji', () => {
  const content = buildPlayIntentUpdatesLogContent({
    headline: 'Friday Night Helldivers',
    entries: [
      { title: '⏰ Someone is running late', body: 'Sam is interested but running late for Helldivers 2.' },
      { title: '✅ Someone is interested', body: 'Alex is interested in playing Helldivers 2.' }
    ]
  })

  assert.equal(content, [
    '📣 Updates — Friday Night Helldivers',
    '-# ⏰ Sam is interested but running late for Helldivers 2.',
    '-# ✅ Alex is interested in playing Helldivers 2.'
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

  assert.match(content, /\n\n-# Ryan just launched Helldivers 2 for this call to play\.$/)
})

test('log content never contains Discord mention markup', () => {
  const content = buildPlayIntentUpdatesLogContent({
    headline: 'Squad night',
    entries: [
      { title: '✅ Someone is interested', body: 'Alex is interested in playing Helldivers 2.' },
      { title: '🎙 Someone joined the voice channel', body: 'Sam just joined the voice channel squad-up for this call to play.' }
    ]
  })

  assert.doesNotMatch(content, /<@/)
})

test('log content collapses multi-line bodies into a single entry line', () => {
  const content = buildPlayIntentUpdatesLogContent({
    entries: [
      { title: '✅ Someone is interested', body: 'Alex is interested.\nMore detail here.' }
    ]
  })

  assert.match(content, /-# ✅ Alex is interested\. More detail here\./)
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
  assert.match(content, /-# …and 3 earlier updates\.$/)
})
