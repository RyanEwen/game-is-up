import assert from 'node:assert/strict'
import test from 'node:test'
import { NotificationResponseChoice, type PrismaClient } from '@prisma/client'

// Install a plain client stub before loading the service, avoiding database and Discord traffic.
const prisma = {
  notification: {
    findFirst: async (): Promise<unknown> => null,
    findMany: async () => []
  },
  playIntent: { findUnique: async () => null },
  $transaction: async (operation: unknown): Promise<unknown> => {
    void operation
    return undefined
  }
}
globalThis.__gameIsUpPrisma__ = prisma as unknown as PrismaClient
const { markRunningLateFromWeb, PlayIntentNotificationResponseError } = await import('./play-intent-notification-responses.js')

const notification = {
  id: 'notification-1', userId: 'player-1', gameId: null,
  responseChoice: NotificationResponseChoice.JOIN,
  runningLateAt: new Date(), runningLateMinutes: 15,
  user: { displayName: 'Sam' },
  playIntent: {
    id: 'call-1', expiresAt: new Date(Date.now() + 60000),
    selectionMode: 'LIBRARY', _count: { games: 0 },
    user: { id: 'creator-1', displayName: 'Ryan', identities: [] }
  }
}

test('late response service rejects missing, expired, and non-interested prompts', async (context) => {
  const lookup = context.mock.method(prisma.notification, 'findFirst', async () => null)
  const options = { userId: 'player-1', playIntentId: 'call-1', runningLateMinutes: 15 }
  await assert.rejects(markRunningLateFromWeb(options), (error) => error instanceof PlayIntentNotificationResponseError && error.statusCode === 404)

  lookup.mock.mockImplementation(async () => ({ ...notification, playIntent: { ...notification.playIntent, expiresAt: new Date(0) } }))
  await assert.rejects(markRunningLateFromWeb(options), /no longer active/)

  lookup.mock.mockImplementation(async () => ({ ...notification, responseChoice: NotificationResponseChoice.DECLINE }))
  await assert.rejects(markRunningLateFromWeb(options), /Mark yourself interested/)
})

test('repeating a saved estimate does not write another status update', async (context) => {
  context.mock.method(prisma.notification, 'findFirst', async () => notification)
  context.mock.method(prisma.notification, 'findMany', async () => [])
  context.mock.method(prisma.playIntent, 'findUnique', async () => null)
  const transaction = context.mock.method(prisma, '$transaction', async () => {
    throw new Error('A repeat must not write or fan out status updates')
  })

  const result = await markRunningLateFromWeb({ userId: 'player-1', playIntentId: 'call-1', runningLateMinutes: 15 })
  assert.match(result.message, /about 15 minutes late/)
  assert.equal(transaction.mock.callCount(), 0)
})

test('a revised estimate is persisted and updates the existing creator status', async (context) => {
  context.mock.method(prisma.notification, 'findFirst', async () => notification)
  context.mock.method(prisma.notification, 'findMany', async () => [])
  context.mock.method(prisma.playIntent, 'findUnique', async () => null)
  const writes: { data: { runningLateMinutes?: number; body?: string } }[] = []
  context.mock.method(prisma, '$transaction', async (operation: (transaction: unknown) => Promise<unknown>) => operation({
    notification: {
      findFirst: async () => ({ id: 'creator-status-1' }),
      update: async (options: typeof writes[number]) => { writes.push(options); return { id: 'creator-status-1' } }
    }
  }))

  const result = await markRunningLateFromWeb({ userId: 'player-1', playIntentId: 'call-1', runningLateMinutes: 30 })
  assert.match(result.message, /about 30 minutes late/)
  assert.equal(writes[0]?.data.runningLateMinutes, 30)
  assert.match(writes[1]?.data.body ?? '', /about 30 minutes late/)
})
