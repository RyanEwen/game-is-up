import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from 'discord.js'
import {
  buildPendingDiscordComponents,
  runDiscordMessageAction,
  updateDiscordActionMessage,
} from './discord-action-lifecycle.js'
import {
  discordActionStates,
  type DiscordActionComponents,
} from './discord-action-state.js'

const originalComponents: DiscordActionComponents = [
  {
    type: 1,
    components: [
      {
        type: 2,
        style: ButtonStyle.Primary,
        custom_id: 'action:save',
        label: 'Save',
      },
      {
        type: 2,
        style: ButtonStyle.Secondary,
        custom_id: 'action:cancel',
        label: 'Cancel',
      },
      {
        type: 2,
        style: ButtonStyle.Link,
        url: 'https://example.com',
        label: 'Open App',
      },
    ],
  },
]

/** Small interaction fixture tracks message edits independently of Discord's client UI. */
function fixture(messageId: string) {
  let components = structuredClone(originalComponents)
  let updates = 0
  const replies: unknown[] = []
  const interaction = {
    replied: false,
    deferred: false,
    customId: 'action:save',
    isModalSubmit: () => false,
    message: {
      id: messageId,
      content: 'Call to play',
      embeds: [],
      components: [ActionRowBuilder.from(originalComponents[0]!)],
    },
    update: async (payload: { components: DiscordActionComponents }) => {
      updates += 1
      interaction.replied = true
      components = payload.components
    },
    editReply: async (payload: { components: DiscordActionComponents }) => {
      components = payload.components
    },
    fetchReply: async () => ({
      components: components.map((row) => ({
        ...row,
        components: row.components.map((component) => ({
          ...component,
          customId: 'custom_id' in component ? component.custom_id : undefined,
        })),
      })),
    }),
    reply: async (payload: unknown) => {
      replies.push(payload)
    },
    followUp: async (payload: unknown) => {
      replies.push(payload)
    },
  }
  return {
    interaction: interaction as unknown as ButtonInteraction,
    components: () => components,
    updates: () => updates,
    replies,
  }
}

test('slow actions acknowledge before work and prevent duplicate processing', async () => {
  const first = fixture('slow-action')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const task = runDiscordMessageAction(first.interaction, async () => {
    assert.equal(first.updates(), 1)
    assert.equal(first.components()[0]?.components[0]?.disabled, true)
    assert.equal(discordActionStates.get('slow-action')?.preview?.pending, true)
    started()
    await gate
  })
  await ready
  const second = fixture('slow-action')
  await runDiscordMessageAction(second.interaction, async () => {
    assert.fail('duplicate action ran')
  })
  assert.equal(second.replies.length, 1)
  release()
  await task
  assert.deepEqual(
    JSON.parse(JSON.stringify(first.components())),
    originalComponents,
  )
  assert.equal(discordActionStates.has('slow-action'), false)
})

test('failures restore controls and clear the lock', async (context) => {
  context.mock.method(console, 'error', () => {})
  const current = fixture('failure')
  await runDiscordMessageAction(current.interaction, async () => {
    throw new Error('Database unavailable')
  })
  assert.deepEqual(
    JSON.parse(JSON.stringify(current.components())),
    originalComponents,
  )
  assert.equal(current.replies.length, 1)
  assert.equal(discordActionStates.has('failure'), false)
})

test('completion preserves final controls rather than restoring old choices', async () => {
  const current = fixture('complete')
  const finalRows = [
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('action:done')
          .setLabel('Done')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      )
      .toJSON(),
  ]
  await runDiscordMessageAction(current.interaction, async () => {
    await updateDiscordActionMessage(current.interaction, {
      components: finalRows,
    })
  })
  assert.deepEqual(current.components(), finalRows)
  assert.equal(current.updates(), 1)
})

test('tracked refresh controls are restored instead of the pre-click snapshot', async () => {
  const current = fixture('refresh')
  const refreshed = structuredClone(originalComponents)
  const button = refreshed[0]!.components[0]!
  if ('label' in button) button.label = 'Change response'
  await runDiscordMessageAction(current.interaction, async () => {
    discordActionStates.get('refresh')!.restoreComponents = refreshed
  })
  assert.deepEqual(current.components(), refreshed)
})

test('waiting components keep links usable and mark select menus for recovery', () => {
  const pending = buildPendingDiscordComponents(
    originalComponents,
    'action:save',
  )
  assert.equal(pending[0]?.components[2]?.disabled, undefined)
  const menu = buildPendingDiscordComponents(
    [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: 'select:duration',
            options: [{ label: 'One hour', value: '60' }],
          },
        ],
      },
    ],
    'select:duration',
  )
  assert.equal(menu[0]?.components[0]?.disabled, true)
  assert.equal(
    'custom_id' in menu[0]!.components[0]! && menu[0]!.components[0]!.custom_id,
    'discord-action-pending',
  )
})

test('modal actions retain their initial response for opening a form', async () => {
  const current = fixture('modal')
  let opened = false
  await runDiscordMessageAction(
    current.interaction,
    async () => {
      opened = true
    },
    { opensModal: true },
  )
  assert.equal(opened, true)
  assert.equal(current.updates(), 0)
})

test('controls recover when Discord cannot fetch the final message', async () => {
  const current = fixture('read-failure')
  current.interaction.fetchReply = async () => {
    throw new Error('Temporary Discord outage')
  }
  await runDiscordMessageAction(current.interaction, async () => {})
  assert.deepEqual(
    JSON.parse(JSON.stringify(current.components())),
    originalComponents,
  )
})

test('two messages for the same saved draft cannot post it concurrently', async () => {
  const first = fixture('draft-message-one')
  let release!: () => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const task = runDiscordMessageAction(
    first.interaction,
    async () => {
      started()
      await gate
    },
    { lockKey: 'shared-draft' },
  )
  await ready
  const second = fixture('draft-message-two')
  await runDiscordMessageAction(
    second.interaction,
    async () => {
      assert.fail('duplicate post ran')
    },
    { lockKey: 'shared-draft' },
  )
  assert.equal(second.replies.length, 1)
  release()
  await task
})
