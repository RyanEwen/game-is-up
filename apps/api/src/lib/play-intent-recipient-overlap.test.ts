import assert from 'node:assert/strict'
import test from 'node:test'
import { PlayIntentSelectionMode as PrismaPlayIntentSelectionMode } from '../generated/prisma/client.js'
import {
  doPlayIntentWindowsOverlap,
  excludeRecipientUserIdsWithOverlappingActiveIntents,
} from './play-intents.js'

test('scheduled intents do not exclude recipients whose matching call ends before the scheduled start', () => {
  const recipientUserIds = excludeRecipientUserIdsWithOverlappingActiveIntents({
    recipientUserIds: ['recipient-1'],
    activeRecipientIntents: [
      {
        userId: 'recipient-1',
        selectionMode: PrismaPlayIntentSelectionMode.SELECTED_GAMES,
        windowStartsAt: new Date('2026-04-22T16:00:00.000Z'),
        windowEndsAt: new Date('2026-04-22T17:00:00.000Z'),
        games: [{ gameId: 'game-1' }],
      },
    ],
    overlappingGameIds: ['game-1'],
    playIntentStartsAt: new Date('2026-04-22T19:00:00.000Z'),
    playIntentEndsAt: new Date('2026-04-22T21:00:00.000Z'),
    creatorUserId: 'creator-1',
    selfAudienceMode: 'exclude',
  })

  assert.deepEqual(recipientUserIds, ['recipient-1'])
})

test('scheduled intents still exclude recipients whose matching call overlaps the scheduled window', () => {
  const recipientUserIds = excludeRecipientUserIdsWithOverlappingActiveIntents({
    recipientUserIds: ['recipient-1'],
    activeRecipientIntents: [
      {
        userId: 'recipient-1',
        selectionMode: PrismaPlayIntentSelectionMode.SELECTED_GAMES,
        windowStartsAt: new Date('2026-04-22T18:30:00.000Z'),
        windowEndsAt: new Date('2026-04-22T20:30:00.000Z'),
        games: [{ gameId: 'game-1' }],
      },
    ],
    overlappingGameIds: ['game-1'],
    playIntentStartsAt: new Date('2026-04-22T19:00:00.000Z'),
    playIntentEndsAt: new Date('2026-04-22T21:00:00.000Z'),
    creatorUserId: 'creator-1',
    selfAudienceMode: 'exclude',
  })

  assert.deepEqual(recipientUserIds, [])
})

test('whole-library intents with overlapping windows still exclude recipients', () => {
  const recipientUserIds = excludeRecipientUserIdsWithOverlappingActiveIntents({
    recipientUserIds: ['recipient-1'],
    activeRecipientIntents: [
      {
        userId: 'recipient-1',
        selectionMode: PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY,
        windowStartsAt: new Date('2026-04-22T18:30:00.000Z'),
        windowEndsAt: new Date('2026-04-22T20:30:00.000Z'),
        games: [],
      },
    ],
    overlappingGameIds: ['game-1'],
    playIntentStartsAt: new Date('2026-04-22T19:00:00.000Z'),
    playIntentEndsAt: new Date('2026-04-22T21:00:00.000Z'),
    creatorUserId: 'creator-1',
    selfAudienceMode: 'exclude',
  })

  assert.deepEqual(recipientUserIds, [])
})

test('window overlap helper treats touching boundaries as non-overlapping', () => {
  assert.equal(
    doPlayIntentWindowsOverlap({
      leftStartsAt: new Date('2026-04-22T16:00:00.000Z'),
      leftEndsAt: new Date('2026-04-22T17:00:00.000Z'),
      rightStartsAt: new Date('2026-04-22T17:00:00.000Z'),
      rightEndsAt: new Date('2026-04-22T18:00:00.000Z'),
    }),
    false,
  )
})
