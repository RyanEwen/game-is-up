/** Real PostgreSQL regressions run only with explicit opt-in against the disposable hub_review database. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { mock } from 'node:test'
import { prisma } from './prisma.js'
import { saveLibraryGame, writeLibraryGame, removeLibraryEntry } from './library.js'
import { createFriendsList, updateFriendsList, deleteFriendsList } from './friends-lists.js'
import { addFriend, removeFriend, removeOwnedFriend } from './friends.js'
import { RecordChangedError } from './mutation-conflict.js'

const enabled = process.env.RUN_ACCOUNT_HUB_DATABASE_TESTS === '1'

/** Create unrelated test identities and always remove their rows, including after a failed assertion. */
async function withFixture(run: (fixture: { owner: string; first: string; second: string; gameId: string }) => Promise<void>) {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/hub_review', 'Refusing database tests outside the disposable hub_review database')
  const prefix = randomUUID()
  const users = await Promise.all(['owner', 'first', 'second'].map((name) => prisma.user.create({
    data: { handle: `${prefix}-${name}`, displayName: name }
  })))
  const game = await prisma.game.create({ data: { slug: prefix, title: `Hub review ${prefix}` } })
  try {
    await run({ owner: users[0]!.id, first: users[1]!.id, second: users[2]!.id, gameId: game.id })
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
    await prisma.game.delete({ where: { id: game.id } })
  }
}

const input = { title: 'Hub review game', platformLabels: ['PC'], intent: 'interested' as const, availability: '' }

test('private library revisions serialize concurrent edits and cannot recreate a removed record', { skip: !enabled }, async () => {
  await withFixture(async ({ owner, gameId }) => {
    await writeLibraryGame(owner, gameId, input)
    const original = await prisma.userGameInterest.findUniqueOrThrow({ where: { userId_gameId: { userId: owner, gameId } } })
    const condition = { kind: 'edit' as const, entryId: original.id, updatedAt: original.updatedAt }
    const edits = await Promise.allSettled([
      saveLibraryGame(owner, gameId, { ...input, intent: 'wishlist' }, condition),
      saveLibraryGame(owner, gameId, { ...input, intent: 'playing-now' }, condition)
    ])
    assert.equal(edits.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(edits.filter((result) => result.status === 'rejected' && result.reason instanceof RecordChangedError).length, 1)
    const current = await prisma.userGameInterest.findUniqueOrThrow({ where: { id: original.id } })
    assert.ok(current.updatedAt.getTime() > original.updatedAt.getTime())
    await assert.rejects(removeLibraryEntry(owner, original.id, original.updatedAt), RecordChangedError)
    const race = await Promise.allSettled([
      removeLibraryEntry(owner, current.id, current.updatedAt),
      saveLibraryGame(owner, gameId, input, { ...condition, updatedAt: current.updatedAt })
    ])
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1)
    const remaining = await prisma.userGameInterest.findUnique({ where: { id: current.id } })
    assert.equal(Boolean(remaining), race[1]!.status === 'fulfilled')
    if (remaining) {
      await removeLibraryEntry(owner, remaining.id, remaining.updatedAt)
    }
    await assert.rejects(saveLibraryGame(owner, gameId, input, condition), RecordChangedError)
    assert.equal(await prisma.userGameInterest.count({ where: { userId: owner, gameId } }), 0)
  })
})

test('HTTP and Steam-style writes consume private revisions under a frozen clock and preserve current platforms in place', { skip: !enabled }, async () => {
  await withFixture(async ({ owner, gameId }) => {
    await writeLibraryGame(owner, gameId, input)
    const original = await prisma.userGameInterest.update({
      where: { userId_gameId: { userId: owner, gameId } }, data: { updatedAt: new Date('2030-01-01T00:00:00.000Z') }
    })
    const clock = mock.method(Date, 'now', () => original.updatedAt.getTime() - 1000)
    try {
      await saveLibraryGame(owner, gameId, { ...input, intent: 'wishlist', platformLabels: ['Xbox'] })
      const web = await prisma.userGameInterest.findUniqueOrThrow({ where: { id: original.id } })
      assert.equal(web.updatedAt.getTime(), original.updatedAt.getTime() + 1)
      await assert.rejects(saveLibraryGame(owner, gameId, input, { kind: 'edit', entryId: original.id, updatedAt: original.updatedAt }), RecordChangedError)
      // Steam import shares this transaction-only helper and finalizes side effects once per batch.
      await writeLibraryGame(owner, gameId, { ...input, platformLabels: ['Switch'], intent: 'playing-now' })
      const imported = await prisma.userGameInterest.findUniqueOrThrow({ where: { id: original.id } })
      assert.equal(imported.updatedAt.getTime(), web.updatedAt.getTime() + 1)
      await assert.rejects(removeLibraryEntry(owner, original.id, web.updatedAt), RecordChangedError)
      await saveLibraryGame(owner, gameId, input, { kind: 'edit', entryId: original.id, updatedAt: imported.updatedAt, preservePlatforms: true })
      const preserved = await prisma.userGameInterest.findUniqueOrThrow({ where: { id: original.id }, include: { platforms: true } })
      assert.deepEqual(preserved.platforms.map((platform) => platform.platformLabel), ['Switch'])
      assert.equal(preserved.updatedAt.getTime(), imported.updatedAt.getTime() + 1)
      await assert.rejects(saveLibraryGame(owner, gameId, input, { kind: 'create' }), RecordChangedError)
      const unchanged = await prisma.userGameInterest.findUniqueOrThrow({ where: { id: original.id }, include: { platforms: true } })
      assert.deepEqual(unchanged.platforms.map((platform) => platform.platformLabel), ['Switch'])
      assert.equal(unchanged.updatedAt.getTime(), preserved.updatedAt.getTime())
    } finally {
      clock.mock.restore()
    }
  })
})

test('stale list rename, membership and removal cannot overwrite newer web changes or each other', { skip: !enabled }, async () => {
  await withFixture(async ({ owner, first, second }) => {
    await addFriend(owner, first)
    await addFriend(owner, second)
    const list = await createFriendsList(owner, 'Crew', [first])
    const original = await prisma.friendsList.update({ where: { id: list.id }, data: { updatedAt: new Date('2030-01-01T00:00:00.000Z') } })
    const clock = mock.method(Date, 'now', () => original.updatedAt.getTime())
    try {
      await updateFriendsList(owner, list.id, 'From web', [first, second])
      const current = await prisma.friendsList.findUniqueOrThrow({ where: { id: list.id } })
      assert.equal(current.updatedAt.getTime(), original.updatedAt.getTime() + 1)
      await assert.rejects(updateFriendsList(owner, list.id, 'Old rename', [first], original.updatedAt), RecordChangedError)
      await assert.rejects(updateFriendsList(owner, list.id, current.name, [first], original.updatedAt), RecordChangedError)
      await assert.rejects(deleteFriendsList(owner, list.id, original.updatedAt), RecordChangedError)
      const edits = await Promise.allSettled([
        updateFriendsList(owner, list.id, 'Rename', [first, second], current.updatedAt),
        updateFriendsList(owner, list.id, current.name, [second], current.updatedAt)
      ])
      assert.equal(edits.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(edits.filter((result) => result.status === 'rejected' && result.reason instanceof RecordChangedError).length, 1)
      const fresh = await prisma.friendsList.findUniqueOrThrow({ where: { id: list.id }, include: { members: true } })
      assert.equal(fresh.updatedAt.getTime(), current.updatedAt.getTime() + 1)
      await assert.rejects(deleteFriendsList(first, list.id, fresh.updatedAt), RecordChangedError)
      assert.equal(await deleteFriendsList(owner, list.id, fresh.updatedAt), true)
    } finally {
      clock.mock.restore()
    }
  })
})

test('an old unfollow confirmation cannot remove a later refollow or someone else\'s follow', { skip: !enabled }, async () => {
  await withFixture(async ({ owner, first, second }) => {
    await addFriend(owner, first)
    const original = await prisma.friend.findUniqueOrThrow({ where: { userId_friendedUserId: { userId: owner, friendedUserId: first } } })
    await removeFriend(owner, first)
    await addFriend(owner, first)
    await assert.rejects(removeOwnedFriend(owner, original.id), RecordChangedError)
    const current = await prisma.friend.findUniqueOrThrow({ where: { userId_friendedUserId: { userId: owner, friendedUserId: first } } })
    assert.notEqual(current.id, original.id)
    await assert.rejects(removeOwnedFriend(second, current.id), RecordChangedError)
    await removeOwnedFriend(owner, current.id)
    assert.equal(await prisma.friend.count({ where: { userId: owner } }), 0)
  })
})

test.after(async () => {
  await prisma.$disconnect()
})
