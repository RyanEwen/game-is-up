/** Hub regressions use real routing/services with an in-memory Prisma boundary and no Discord network. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { mock } from 'node:test'
import {
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js'
import type { Prisma, PrismaClient } from '../generated/prisma/client.js'

const owner = randomUUID()
const friendId = randomUUID()
const entryId = randomUUID()
const gameId = randomUUID()
const listId = randomUUID()
const followId = randomUUID()
const actor = '123456789012345678'
const serverId = '223456789012345678'
const now = new Date()
const calls: { name: string; args: unknown }[] = []
let linked = true
let blocked = false
let entryExists = true
let listedFriends = 0
let librarySize = 0
let listExists = true
let backfills = 0
let selections: string[] = []
let identityFails = false
let libraryReadFails = false
const entry = {
  id: entryId,
  userId: owner,
  gameId,
  updatedAt: now,
  intentType: 'INTERESTED',
  availability: null,
  game: { id: gameId, title: 'A game', coverUrl: null },
  platforms: [{ platformLabel: 'PC' }],
}
const list = {
  id: listId,
  userId: owner,
  name: 'Crew',
  createdAt: now,
  updatedAt: now,
  members: [
    {
      friendUserId: friendId,
      friendUser: {
        id: friendId,
        displayName: 'Friend',
        handle: 'friend',
        avatarUrl: null,
      },
    },
  ],
}
const candidate = {
  id: friendId,
  displayName: 'Friend',
  handle: 'friend',
  avatarUrl: null,
  bio: '',
  timezoneId: 'America/Toronto',
  usualAvailability: null,
  lastSeenAt: now,
  identities: [],
  gameInterests: [],
  discordServers: [{ serverId, server: { name: 'Server' } }],
}

function record(name: string, args: unknown) {
  calls.push({ name, args })
}
const database = {
  game: {
    findUnique: async (args: unknown) => {
      record('catalog-read', args)
      return {
        ...entry.game,
        description: null,
        sources: [],
        platforms: [{ platformLabel: 'PC' }],
      }
    },
  },
  gamePlatform: { createMany: async () => undefined },
  userIdentity: {
    findUnique: async () => {
      record('identity', {})
      if (identityFails) throw new Error('Identity unavailable')
      return linked
        ? {
            user: {
              id: owner,
              displayName: 'Owner',
              timezoneId: 'America/Toronto',
            },
          }
        : null
    },
    findFirst: async () => null,
  },
  user: {
    findUnique: async (args: { select?: { timezoneId?: boolean } }) => {
      if (args.select?.timezoneId) {
        backfills++
        return null
      }
      return { id: owner }
    },
    findMany: async (args: unknown) => {
      record('discovery', args)
      return blocked ? [] : [candidate]
    },
  },
  userGameInterest: {
    findMany: async () => {
      if (libraryReadFails) throw new Error('Library unavailable')
      return Array.from({ length: librarySize }, (_, index) => ({
        ...entry,
        id: index ? randomUUID() : entryId,
        game: { ...entry.game, title: `Game ${index}` },
      }))
    },
    findFirst: async (args: {
      where: { userId: string; id?: string; gameId?: string }
    }) => {
      record('entry-read', args)
      return entryExists &&
        args.where.userId === owner &&
        (args.where.id === entryId || args.where.gameId === gameId)
        ? entry
        : null
    },
    findUnique: async () => (entryExists ? entry : null),
    create: async (args: unknown) => {
      record('library-create', args)
      return entry
    },
    updateMany: async (args: { where: { id: string; updatedAt: Date } }) => {
      record('library-update', args)
      return {
        count:
          entryExists &&
          args.where.id === entryId &&
          args.where.updatedAt.getTime() === entry.updatedAt.getTime()
            ? 1
            : 0,
      }
    },
    upsert: async (args: unknown) => {
      record('library-save', args)
      return entry
    },
    deleteMany: async (args: { where: { userId: string; id: string } }) => {
      record('library-delete', args)
      return {
        count:
          entryExists &&
          args.where.userId === owner &&
          args.where.id === entryId
            ? 1
            : 0,
      }
    },
  },
  userGameInterestPlatform: {
    deleteMany: async (args: unknown) => {
      record('platform-delete', args)
    },
    createMany: async (args: unknown) => {
      record('platform-create', args)
    },
  },
  playIntentMute: { findMany: async () => [] },
  discordServerPreference: { findMany: async () => [{ serverId }] },
  discordServerMembership: { findMany: async () => [] },
  discordActivityObservation: { findMany: async () => [] },
  friend: {
    findMany: async (args: {
      where: { userId?: string; friendedUserId?: string }
    }) =>
      args.where.friendedUserId
        ? []
        : Array.from({ length: listedFriends }, (_, index) => ({
            id: index ? randomUUID() : followId,
            friendedUserId: index ? `friend-${index}` : friendId,
            friendedUser: {
              id: index ? `friend-${index}` : friendId,
              displayName: `Friend ${index}`,
              handle: `friend${index}`,
            },
          })),
    upsert: async (args: unknown) => {
      record('friend-add', args)
    },
    deleteMany: async (args: unknown) => {
      record('friend-delete', args)
      return { count: 1 }
    },
  },
  friendsList: {
    findMany: async () => (listExists ? [list] : []),
    findFirst: async (args: {
      where: { id?: string; userId: string; name?: string }
    }) => {
      record('list-read', args)
      if (args.where.name) return null
      return listExists &&
        args.where.userId === owner &&
        args.where.id === listId
        ? list
        : null
    },
    findUnique: async () => null,
    create: async (args: unknown) => {
      record('list-create', args)
      return list
    },
    updateMany: async (args: unknown) => {
      record('list-claim', args)
      return { count: 1 }
    },
    update: async (args: {
      data: { members: { create: { friendUserId: string }[] } }
    }) => {
      record('list-update', args)
      selections = args.data.members.create.map((member) => member.friendUserId)
      return list
    },
    deleteMany: async (args: { where: { userId: string; id: string } }) => {
      record('list-delete', args)
      return {
        count:
          listExists && args.where.userId === owner && args.where.id === listId
            ? 1
            : 0,
      }
    },
  },
  friendsListMember: {
    deleteMany: async (args: unknown) => {
      record('member-delete', args)
    },
  },
  $executeRaw: async () => undefined,
  $queryRaw: async () => [],
  $transaction: async (
    callback: (client: Prisma.TransactionClient) => Promise<unknown>,
  ) => callback(database as unknown as Prisma.TransactionClient),
}
globalThis.__gameIsUpPrisma__ = database as unknown as PrismaClient
const { handleAccountHubInteraction } = await import('./discord-account-hub.js')
const { buildAccountHubPostPayload } =
  await import('./discord-account-hub-post.js')
const {
  panelId,
  panelPage,
  panelSelect,
  parsePanelId,
  panelRevision,
  parsePanelRevision,
} = await import('./discord-account-panel.js')
const { renderGamesPanel, handleGamesPanel, parsePanelPlayInterest } =
  await import('./discord-games-panel.js')
const { renderFriendsPanel, addEligiblePanelFriend } =
  await import('./discord-friends-panel.js')
const { handleFriendsListsPanel, mergeListPageMembers } =
  await import('./discord-friends-lists-panel.js')
const { saveLibraryGame, removeLibraryEntry } = await import('./library.js')
const { createFriendsList, updateFriendsList, deleteFriendsList } =
  await import('./friends-lists.js')
const { addFriend, removeFriend } = await import('./friends.js')
const { subscribeToDashboardInvalidations } =
  await import('./dashboard-events.js')
const { env } = await import('./env.js')
const { discordPresenceBotState, setDiscordBotClient } =
  await import('./discord-bot-runtime.js')
env.DISCORD_BOT_TOKEN = 'local-test-token'
discordPresenceBotState.mode = 'gateway'
setDiscordBotClient({
  guilds: { cache: new Map([[serverId, { id: serverId, name: 'Server' }]]) },
} as unknown as Client)

/** A realistic source message records update versus private reply separately. */
function interactionFor(customId: string, publicMessage = false) {
  const updates: unknown[] = []
  const replies: {
    content?: string
    flags?: number
    components?: unknown[]
    embeds?: unknown[]
  }[] = []
  const sourceRows = publicMessage
    ? buildAccountHubPostPayload().components
    : [panelSelect(actor, 'game', 'Games', [{ label: 'Game', value: entryId }])]
  const interaction = {
    customId,
    user: { id: actor },
    guildId: serverId,
    guild: { name: 'Server' },
    deferred: false,
    replied: false,
    message: {
      id: randomUUID(),
      flags: {
        has: (flag: number) =>
          !publicMessage && flag === MessageFlags.Ephemeral,
      },
      content: '',
      embeds: [],
      components: sourceRows,
    },
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isFromMessage: () => true,
    reply: async (payload: (typeof replies)[number]) => {
      replies.push(payload)
      interaction.replied = true
    },
    deferReply: async (payload: (typeof replies)[number]) => {
      replies.push(payload)
      interaction.deferred = true
    },
    update: async (payload: unknown) => {
      record('ack', {})
      updates.push(payload)
      interaction.replied = true
    },
    editReply: async (payload: (typeof replies)[number]) => {
      replies.push(payload)
    },
    fetchReply: async () => ({ components: [] }),
    followUp: async (payload: (typeof replies)[number]) => {
      record('follow-up', {})
      replies.push(payload)
    },
    showModal: async (payload: unknown) => {
      updates.push(payload)
      interaction.replied = true
    },
  }
  return {
    interaction: interaction as unknown as ButtonInteraction,
    replies,
    updates,
  }
}

function reset() {
  calls.length = 0
  linked = true
  blocked = false
  entryExists = true
  listExists = true
  listedFriends = 0
  librarySize = 0
  backfills = 0
  selections = []
  identityFails = false
  libraryReadFails = false
  entry.updatedAt = now
}

function controls(view: { components: { toJSON(): unknown }[] }) {
  return JSON.stringify(view.components.map((row) => row.toJSON()))
}

test('hub retains old composer entry and exposes all five named actions without personal data', () => {
  const payload = buildAccountHubPostPayload()
  const json = controls(payload)
  for (const label of [
    "Join Game's Up",
    'Send out a call to play',
    'My games',
    'My friends',
    'App',
  ])
    assert.ok(json.includes(label))
  assert.ok(json.includes('guild-ctp:open'))
  assert.ok(!JSON.stringify(payload).includes(owner))
  assert.ok(payload.components.every((row) => row.components.length <= 5))
})

test('public launches defer privately and never update the shared hub for linked or unlinked actors', async () => {
  for (const isLinked of [true, false]) {
    reset()
    linked = isLinked
    const { interaction, updates, replies } = interactionFor(
      'account-hub:open:games',
      true,
    )
    await handleAccountHubInteraction(interaction)
    assert.equal(updates.length, 0)
    assert.equal(replies[0]?.flags, MessageFlags.Ephemeral)
    assert.equal(replies.length, 2)
    const output = JSON.stringify(replies[1])
    assert.match(
      output,
      isLinked ? /Your library is empty/ : /serverId=223456789012345678/,
    )
    assert.ok(!output.includes('library-save'))
  }
})

test('private controls reject foreign actors and forged public actions before account access', async () => {
  reset()
  for (const customId of [
    panelId('other-actor', 'game-remove-confirm', entryId),
    'account-hub:open:game-remove-confirm',
  ]) {
    const { interaction, updates, replies } = interactionFor(customId)
    await handleAccountHubInteraction(interaction)
    assert.equal(updates.length, 0)
    assert.equal(replies[0]?.flags, MessageFlags.Ephemeral)
  }
  assert.equal(calls.length, 0)
  assert.equal(parsePanelId('account-hub:open:games:extra', actor), null)
})

test('private actions use pending lifecycle and recover stale library ids without writing', async () => {
  reset()
  entryExists = false
  const { interaction, replies, updates } = interactionFor(
    panelId(actor, 'game-edit', randomUUID()),
  )
  await handleAccountHubInteraction(interaction)
  assert.equal(updates.length, 1)
  assert.match(JSON.stringify(updates[0]), /no longer exists/)
  assert.equal(replies.length, 0)
  assert.ok(!calls.some((call) => call.name === 'library-save'))
  const ordinary = interactionFor(panelId(actor, 'games'))
  await handleAccountHubInteraction(ordinary.interaction)
  assert.equal(ordinary.updates.length, 1)
  assert.match(
    JSON.stringify(ordinary.updates[0]),
    /Working|Please wait|Processing/,
  )
  assert.match(JSON.stringify(ordinary.replies.at(-1)), /My games/)
})

test('empty games and friends have setup actions, corresponding App links, and pages bound to 25 options', async () => {
  reset()
  assert.match(controls(await renderGamesPanel(owner, actor)), /Search catalog/)
  assert.match(controls(await renderFriendsPanel(owner, actor)), /Find friends/)
  librarySize = 27
  listedFriends = 27
  for (const view of [
    await renderGamesPanel(owner, actor, 0),
    await renderFriendsPanel(owner, actor, 0),
  ]) {
    const select = view.components[0]!.toJSON().components[0]!
    assert.ok('options' in select)
    assert.equal(select.options.length, 25)
    const ids = view.components
      .flatMap((row) => row.toJSON().components)
      .filter((control) => 'custom_id' in control)
      .map((control) => 'custom_id' in control && control.custom_id)
    assert.equal(new Set(ids).size, ids.length)
  }
  assert.equal(panelPage(Array.from({ length: 27 }), 999).items.length, 2)
  assert.equal(panelPage([], -1).page, 0)
  assert.equal(parsePanelPlayInterest('Playing now'), 'playing-now')
  assert.equal(parsePanelPlayInterest('playing-now'), 'playing-now')
  assert.ok(panelId(actor, 'discover', 999, 'x'.repeat(40)).length <= 100)
})

test('fresh discovery and both block filters are checked before following someone from a stale picker', async () => {
  reset()
  assert.equal(await addEligiblePanelFriend(owner, friendId), true)
  assert.equal(calls.filter((call) => call.name === 'friend-add').length, 1)
  const discovery = calls.find((call) => call.name === 'discovery')?.args as {
    where: Record<string, unknown>
  }
  assert.deepEqual(discovery.where.blocksGiven, {
    none: { blockedUserId: owner },
  })
  assert.deepEqual(discovery.where.blocksReceived, { none: { userId: owner } })
  assert.deepEqual(discovery.where.OR, [
    { discordServers: { some: { serverId: { in: [serverId] } } } },
  ])
  blocked = true
  assert.equal(await addEligiblePanelFriend(owner, friendId), false)
  assert.equal(calls.filter((call) => call.name === 'friend-add').length, 1)
})

test('shared game writes replace platforms transactionally, backfill once, and preserve invalidation behavior', async () => {
  reset()
  const events: string[][] = []
  const unsubscribe = subscribeToDashboardInvalidations(owner, (event) =>
    events.push(event.domains),
  )
  try {
    await saveLibraryGame(owner, gameId, {
      title: 'A game',
      platformLabels: [' PC ', 'PC'],
      intent: 'interested',
      availability: '',
    })
    assert.equal(backfills, 1)
    assert.deepEqual(
      calls.find((call) => call.name === 'platform-create')?.args,
      { data: [{ userGameInterestId: entryId, platformLabel: 'PC' }] },
    )
    assert.deepEqual(events, [['library', 'discovery', 'play-intents']])
    assert.equal(await removeLibraryEntry(owner, entryId), true)
    assert.equal(backfills, 1)
    assert.equal(events.length, 2)
    assert.equal(await removeLibraryEntry(owner, randomUUID()), false)
    assert.equal(events.length, 2)
    await assert.rejects(
      saveLibraryGame(owner, gameId, {
        title: 'Game',
        platformLabels: [],
        intent: 'interested',
      }),
    )
    assert.equal(calls.filter((call) => call.name === 'library-save').length, 1)
  } finally {
    unsubscribe()
  }
})

test('shared friend mutations target only the actor and publish a targeted refresh', async () => {
  reset()
  const ownEvents: unknown[] = []
  const otherEvents: unknown[] = []
  const unsubscribe = subscribeToDashboardInvalidations(owner, (event) =>
    ownEvents.push(event),
  )
  const unsubscribeOther = subscribeToDashboardInvalidations(
    randomUUID(),
    (event) => otherEvents.push(event),
  )
  try {
    await assert.rejects(addFriend(owner, owner), /yourself/)
    await addFriend(owner, friendId)
    await removeFriend(owner, friendId)
    assert.equal(ownEvents.length, 2)
    assert.equal(otherEvents.length, 0)
    assert.deepEqual(
      calls.find((call) => call.name === 'friend-delete')?.args,
      { where: { userId: owner, friendedUserId: friendId } },
    )
  } finally {
    unsubscribe()
    unsubscribeOther()
  }
})

test('list page replacement preserves other pages and rejects forged selections', async () => {
  reset()
  assert.deepEqual(mergeListPageMembers(['a', 'b', 'z'], ['a', 'b'], ['b']), [
    'z',
    'b',
  ])
  assert.throws(() => mergeListPageMembers(['a'], ['a'], ['foreign']))
  listedFriends = 1
  const interaction = {
    user: { id: actor },
    isStringSelectMenu: () => true,
    values: [friendId],
    component: { options: [{ value: friendId }] },
  } as unknown as StringSelectMenuInteraction
  await handleFriendsListsPanel(interaction, owner, 'list-members', [
    listId,
    '0',
    panelRevision(list.updatedAt),
  ])
  assert.deepEqual(selections, [friendId])
  listExists = false
  await handleFriendsListsPanel(interaction, owner, 'list-members', [
    listId,
    '0',
    panelRevision(list.updatedAt),
  ])
  assert.equal(calls.filter((call) => call.name === 'list-update').length, 1)
  const missingListId = randomUUID()
  const remove = interactionFor(
    panelId(actor, 'list-remove-confirm', missingListId),
  ).interaction
  await assert.rejects(
    handleFriendsListsPanel(remove, owner, 'list-remove-confirm', [
      missingListId,
      panelRevision(now),
    ]),
    /changed or was deleted/,
  )
  assert.deepEqual(calls.at(-1)?.args, {
    where: { id: missingListId, userId: owner, updatedAt: now },
  })
})

test('game removal requires a separate confirm action; foreign entries cannot be edited or deleted', async () => {
  reset()
  const interaction = interactionFor(
    panelId(actor, 'game-remove', entryId),
  ).interaction
  const confirmation = await handleGamesPanel(
    interaction,
    owner,
    'game-remove',
    [entryId],
  )
  assert.ok(confirmation)
  assert.match(controls(confirmation), /game-remove-confirm/)
  assert.ok(!calls.some((call) => call.name === 'library-delete'))
  const missingId = randomUUID()
  const modal = {
    user: { id: actor },
    isStringSelectMenu: () => false,
    isModalSubmit: () => true,
  } as unknown as ModalSubmitInteraction
  await handleGamesPanel(modal, owner, 'game-edit-save', [missingId])
  assert.ok(!calls.some((call) => call.name === 'library-save'))
  await assert.rejects(
    handleGamesPanel(interaction, owner, 'game-remove-confirm', [
      missingId,
      panelRevision(now),
    ]),
    /changed or was removed/,
  )
})

test('shared lists validate names and current membership, reject foreign ownership, and refresh only the owner', async () => {
  reset()
  listedFriends = 1
  const events: unknown[] = []
  const unsubscribe = subscribeToDashboardInvalidations(owner, (event) =>
    events.push(event),
  )
  try {
    await assert.rejects(createFriendsList(owner, '   ', [friendId]))
    await assert.rejects(
      createFriendsList(owner, 'Crew', [randomUUID()]),
      /already added/,
    )
    assert.equal(calls.filter((call) => call.name === 'list-create').length, 0)
    await createFriendsList(owner, '  Crew  ', [friendId])
    assert.equal(events.length, 1)
    const create = calls.find((call) => call.name === 'list-create')?.args as {
      data: { name: string }
    }
    assert.equal(create.data.name, 'Crew')
    await assert.rejects(
      updateFriendsList(randomUUID(), listId, 'Other', [friendId]),
      /no longer exists/,
    )
    assert.equal(calls.filter((call) => call.name === 'list-update').length, 0)
    await updateFriendsList(owner, listId, 'Crew', [friendId])
    assert.equal(events.length, 2)
    assert.equal(await deleteFriendsList(randomUUID(), listId), false)
    assert.equal(events.length, 2)
    assert.equal(await deleteFriendsList(owner, listId), true)
    assert.equal(events.length, 3)
  } finally {
    unsubscribe()
  }
})

test('catalog selection acknowledges before detail resolution and offers a separate local modal action', async () => {
  reset()
  const fixture = interactionFor(panelId(actor, 'game-add'))
  const select = Object.assign(fixture.interaction, {
    isButton: () => false,
    isStringSelectMenu: () => true,
    values: [`local:${gameId}`],
  }) as unknown as StringSelectMenuInteraction
  await handleAccountHubInteraction(select)
  const acknowledgementIndex = calls.findIndex((call) => call.name === 'ack')
  const providerIndex = calls.findIndex((call) => call.name === 'catalog-read')
  assert.ok(acknowledgementIndex >= 0 && providerIndex > acknowledgementIndex)
  assert.match(JSON.stringify(fixture.replies.at(-1)), /game-configure/)
  assert.ok(!calls.some((call) => call.name === 'library-save'))

  const configure = interactionFor(panelId(actor, 'game-configure', gameId))
  await handleAccountHubInteraction(configure.interaction)
  assert.equal(configure.updates.length, 1)
  assert.match(JSON.stringify(configure.updates[0]), /game-edit-save/)
})

test('private controls on a public source cannot disclose personal data', async () => {
  reset()
  const fixture = interactionFor(panelId(actor, 'games'), true)
  await handleAccountHubInteraction(fixture.interaction)
  assert.equal(fixture.updates.length, 0)
  assert.equal(fixture.replies[0]?.flags, MessageFlags.Ephemeral)
  assert.equal(calls.length, 0)
})

test('identity and panel query failures resolve the original private response with red database-free recovery', async () => {
  const log = mock.method(console, 'error', () => undefined)
  try {
    for (const failure of ['identity', 'library']) {
      reset()
      identityFails = failure === 'identity'
      libraryReadFails = failure === 'library'
      const fixture = interactionFor('account-hub:open:games', true)
      await handleAccountHubInteraction(fixture.interaction)
      assert.equal(fixture.updates.length, 0)
      assert.equal(fixture.replies.length, 2)
      const recovery = fixture.replies[1] as {
        embeds: { data: { color: number; title: string } }[]
      }
      assert.equal(recovery.embeds[0]!.data.color, 0xef4444)
      assert.equal(recovery.embeds[1]!.data.title, 'Refresh your private panel')
      assert.match(JSON.stringify(fixture.replies[1]), /My games/)
      assert.ok(!calls.some((call) => call.name === 'follow-up'))
      assert.equal(calls.filter((call) => call.name === 'identity').length, 1)
    }
  } finally {
    reset()
    log.mock.restore()
  }
})

test('long platform lists are never truncated, and blank editing preserves platform rows after a version claim', async () => {
  reset()
  const previous = entry.platforms
  entry.platforms = Array.from({ length: 140 }, (_, index) => ({
    platformLabel: `${index}-${'x'.repeat(27)}`,
  }))
  try {
    const configure = interactionFor(panelId(actor, 'game-edit', entryId))
    await handleAccountHubInteraction(configure.interaction)
    const modal = configure.updates[0] as {
      toJSON(): {
        components: {
          components: { custom_id: string; value?: string; required: boolean }[]
        }[]
        custom_id: string
      }
    }
    const payload = modal.toJSON()
    const platforms = payload.components
      .flatMap((row) => row.components)
      .find((field) => field.custom_id === 'platforms')!
    assert.equal(platforms.value, undefined)
    assert.equal(platforms.required, false)
    assert.ok(payload.custom_id.endsWith(panelRevision(entry.updatedAt)))
    const submit = Object.assign(
      interactionFor(payload.custom_id).interaction,
      {
        isButton: () => false,
        isModalSubmit: () => true,
        fields: {
          getTextInputValue: (id: string) =>
            ({ platforms: '', intent: 'Wishlist', availability: 'Evenings' })[
              id as 'platforms' | 'intent' | 'availability'
            ],
        },
      },
    ) as unknown as ModalSubmitInteraction
    await handleAccountHubInteraction(submit)
    assert.equal(
      calls.filter((call) => call.name === 'library-update').length,
      1,
    )
    assert.ok(
      !calls.some(
        (call) =>
          call.name === 'platform-delete' || call.name === 'platform-create',
      ),
    )
  } finally {
    entry.platforms = previous
  }
})

test('management successes remain green while validation errors and stale records are red', async () => {
  reset()
  const success = await renderGamesPanel(owner, actor, 0, {
    severity: 'success',
    message: 'Game saved.',
  })
  assert.equal(success.embeds[0]!.data.color, 0x22c55e)
  assert.equal(success.embeds[1]!.data.title, 'My games')
  entryExists = false
  const fixture = interactionFor(panelId(actor, 'game-edit', entryId))
  await handleAccountHubInteraction(fixture.interaction)
  const stale = fixture.updates[0] as typeof success
  assert.equal(stale.embeds[0]!.data.color, 0xef4444)
  const invalid = interactionFor(panelId(actor, 'game-remove-confirm', entryId))
  await handleAccountHubInteraction(invalid.interaction)
  const error = invalid.replies.at(-1) as typeof success
  assert.equal(error.embeds[0]!.data.color, 0xef4444)
})

test('revision-bearing controls stay within Discord limits for 20-digit actors and reject absent revisions', () => {
  assert.throws(() => parsePanelRevision(undefined))
  assert.throws(() => parsePanelRevision('not a revision'))
  const largeActor = '12345678901234567890'
  for (const action of [
    'game-edit-save',
    'game-remove-confirm',
    'list-rename-save',
    'list-remove-confirm',
  ]) {
    assert.ok(
      panelId(largeActor, action, entryId, panelRevision(now)).length <= 100,
    )
  }
})
