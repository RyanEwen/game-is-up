import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaClient } from '@prisma/client'
import type { ModalSubmitInteraction } from 'discord.js'

const prisma = {
  userIdentity: {
    findUnique: async (): Promise<unknown> => ({ userId: 'player-1' }),
  },
  notification: {
    findFirst: async (options: unknown): Promise<unknown> => {
      void options
      return null
    },
  },
}
globalThis.__gameIsUpPrisma__ = prisma as unknown as PrismaClient
const { handleRunningLateModalSubmit } =
  await import('./discord-running-late-response.js')

/** Records ephemeral replies without making Discord requests. */
function modalInteraction(value: string) {
  const replies: string[] = []
  const interaction = {
    customId: 'play-intent-late:notification-1',
    user: { id: 'discord-player-1' },
    fields: { getTextInputValue: () => value },
    deferReply: async () => undefined,
    editReply: async (message: string) => {
      replies.push(message)
    },
  } as unknown as ModalSubmitInteraction
  return { interaction, replies }
}

test('invalid Discord estimates are rejected before querying account data', async (context) => {
  const lookup = context.mock.method(prisma.userIdentity, 'findUnique')
  const { interaction, replies } = modalInteraction('1.5')
  await handleRunningLateModalSubmit(interaction)
  assert.equal(lookup.mock.callCount(), 0)
  assert.match(replies[0] ?? '', /whole number of minutes/)
})

test('a forged notification ID must still belong to the linked Discord user', async (context) => {
  const lookup = context.mock.method(
    prisma.notification,
    'findFirst',
    async () => null,
  )
  const { interaction, replies } = modalInteraction('15')
  await handleRunningLateModalSubmit(interaction)
  assert.deepEqual(lookup.mock.calls[0]?.arguments[0], {
    where: { id: 'notification-1', userId: 'player-1' },
    select: { playIntentId: true },
  })
  assert.match(replies[0] ?? '', /not available for your account/)
})

test('a call that expires while the form is open cannot accept the estimate', async (context) => {
  const lookup = context.mock.method(
    prisma.notification,
    'findFirst',
    async () => ({ playIntentId: 'call-1' }),
  )
  lookup.mock.mockImplementationOnce(
    async () => ({
      playIntent: { id: 'call-1', expiresAt: new Date(0) },
    }),
    1,
  )
  const { interaction, replies } = modalInteraction('15')
  await handleRunningLateModalSubmit(interaction)
  assert.match(replies[0] ?? '', /no longer active/)
})
