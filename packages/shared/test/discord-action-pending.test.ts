import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPendingDiscordDmPreview } from '../src/discord-action-pending.js'
import { debugDmPreviewSchema } from '../src/index.js'
import { simulatedAutoPlayDmActionIds } from '../src/debug-dm-simulator.js'
import {
  buildInitialAutoPlayDialogState,
  applyAutoPlayPreviewAction,
} from '../src/debug-dm-simulator-state.js'

test('pending previews disable actions and selects while preserving navigation links', () => {
  const preview = debugDmPreviewSchema.parse({
    content: 'Choose your response',
    embeds: [],
    buttonRows: [
      [
        {
          label: 'Interested',
          style: 'primary',
          disabled: false,
          customId: 'interested',
          url: null,
        },
        {
          label: 'Open app',
          style: 'link',
          disabled: false,
          customId: null,
          url: 'https://gamesup.app',
        },
      ],
    ],
    selectMenus: [
      {
        customId: 'duration',
        placeholder: 'Duration',
        disabled: false,
        minValues: 1,
        maxValues: 1,
        options: [],
      },
    ],
  })
  const pending = debugDmPreviewSchema.parse(
    buildPendingDiscordDmPreview(preview, 'interested'),
  )
  assert.equal(pending.pending, true)
  assert.equal(pending.buttonRows[0]?.[0]?.label, 'Working...')
  assert.equal(pending.buttonRows[0]?.[0]?.disabled, true)
  assert.equal(pending.buttonRows[0]?.[1]?.disabled, false)
  assert.equal(pending.selectMenus?.[0]?.disabled, true)
  assert.equal(preview.buttonRows[0]?.[0]?.disabled, false)
})

test('automatic prompts enter composer before posting the fixed game and immediate start', () => {
  const draft = {
    creatorName: 'Ryan',
    gameTitle: 'Helldivers 2',
    friendRecipientCount: 2,
    networkRecipientCount: 4,
  }
  const initial = buildInitialAutoPlayDialogState({ draft })
  const composing = applyAutoPlayPreviewAction(
    initial,
    simulatedAutoPlayDmActionIds.compose,
    draft,
  )
  assert.equal(composing.status, 'composing')
  const posted = applyAutoPlayPreviewAction(
    composing,
    simulatedAutoPlayDmActionIds.post,
    draft,
  )
  assert.equal(posted.status, 'created')
  assert.equal(posted.durationMinutes, 60)
})
