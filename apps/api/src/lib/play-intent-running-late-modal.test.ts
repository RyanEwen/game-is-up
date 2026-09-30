import assert from 'node:assert/strict'
import test from 'node:test'
import { ComponentType } from 'discord.js'
import { buildRunningLateModal } from './play-intent-running-late-modal.js'

test('Discord delay forms allow an unknown estimate and prefill an existing estimate', () => {
  const blank = buildRunningLateModal('notification-1').toJSON()
  const populated = buildRunningLateModal('notification-1', 15).toJSON()
  assert.equal(blank.custom_id, 'play-intent-late:notification-1')
  const blankRow = blank.components[0]
  const populatedRow = populated.components[0]
  assert.ok(blankRow && blankRow.type === ComponentType.ActionRow)
  assert.ok(populatedRow && populatedRow.type === ComponentType.ActionRow)
  const blankInput = blankRow.components[0]
  const populatedInput = populatedRow.components[0]
  assert.ok(blankInput && blankInput.type === ComponentType.TextInput)
  assert.ok(populatedInput && populatedInput.type === ComponentType.TextInput)
  assert.equal(blankInput.required, false)
  assert.equal(blankInput.value, undefined)
  assert.equal(populatedInput.value, '15')
})
