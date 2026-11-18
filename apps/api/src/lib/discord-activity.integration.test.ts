/**
 * Real PostgreSQL checks for who the Discord presence recorder keeps per-person data about.
 * Run by `npm run test:integration` against a disposable `*_test` database; they fail, never skip, without one.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import {
  DiscordActivityType,
  DiscordGameActivityCountKind,
} from '@prisma/client'
import { prisma } from './prisma.js'
import { assertDisposableDatabase } from '../test-utils/disposable-database.js'
import { recordDiscordPresence, toUtcDay } from './discord-activity.js'

/** One PLAYING activity for a game title unique to this run. */
function playing(title: string) {
  return {
    name: title,
    applicationId: null,
    activityType: DiscordActivityType.PLAYING,
    details: null,
    state: null,
    startedAt: null,
    rawPayload: { name: title },
  }
}

test('presence is kept per person only for signed-up users, and counted anonymously for everyone', async () => {
  assertDisposableDatabase()
  const prefix = randomUUID().slice(0, 8)
  const title = `Presence test ${prefix}`
  const serverId = `presence-server-${prefix}`
  const memberDiscordId = `member-${prefix}`
  const strangerDiscordId = `stranger-${prefix}`

  await prisma.discordServer.create({
    data: { id: serverId, name: 'Presence test server' },
  })
  const member = await prisma.user.create({
    data: {
      handle: `${prefix}-member`,
      displayName: 'Member',
      identities: {
        create: { provider: 'DISCORD', providerUserId: memberDiscordId },
      },
    },
  })

  try {
    await recordDiscordPresence(memberDiscordId, serverId, [playing(title)])
    await recordDiscordPresence(strangerDiscordId, serverId, [playing(title)])

    const game = await prisma.game.findFirstOrThrow({ where: { title } })
    const observed = await prisma.discordObservedGame.findMany({
      where: { gameId: game.id },
    })
    assert.deepEqual(
      observed.map((row) => row.userId),
      [member.id],
      'only the signed-up member gets a per-person row',
    )
    assert.equal(
      await prisma.discordActivityObservation.count({
        where: { gameId: game.id },
      }),
      1,
      'activity observations are per signed-up user only',
    )

    const daily = await prisma.discordGameActivityDaily.findMany({
      where: { gameId: game.id },
    })
    assert.equal(daily.length, 1)
    assert.equal(daily[0]!.serverId, serverId)
    assert.equal(daily[0]!.countKind, DiscordGameActivityCountKind.OBSERVATIONS)
    assert.equal(
      daily[0]!.count,
      2,
      'both presence updates are counted, with no identifier stored',
    )
    assert.equal(
      daily[0]!.day.toISOString(),
      toUtcDay(new Date()).toISOString(),
    )

    // Deleting the account removes its per-person rows; the anonymous count stays.
    await prisma.user.delete({ where: { id: member.id } })
    assert.equal(
      await prisma.discordObservedGame.count({ where: { gameId: game.id } }),
      0,
    )
    assert.equal(
      await prisma.discordGameActivityDaily.count({
        where: { gameId: game.id },
      }),
      1,
    )
  } finally {
    await prisma.user.deleteMany({ where: { id: member.id } })
    await prisma.game.deleteMany({ where: { title } })
    await prisma.discordServer.deleteMany({ where: { id: serverId } })
    await prisma.$disconnect()
  }
})
