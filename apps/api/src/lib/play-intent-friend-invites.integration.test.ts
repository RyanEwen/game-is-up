/**
 * Real PostgreSQL regressions for participant invitations: authorization, concurrency, access and edit persistence.
 * Run by `npm run test:integration` against a disposable `*_test` database; they fail, never skip, without one.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js'
import { randomUUID } from 'node:crypto'
import test, { mock } from 'node:test'
import { NotificationType } from '../generated/prisma/client.js'
import { upsertPlayIntentRequestSchema } from '@game-is-up/shared'
import { prisma } from './prisma.js'
import { assertDisposableDatabase } from '../test-utils/disposable-database.js'
import {
  getPlayIntentInvitableFriends,
  inviteFriendToPlayIntent,
} from './play-intent-friend-invites.js'
import { buildPlayIntentFriendInvitePicker } from './play-intent-friend-invite-picker.js'
import { buildPlayIntentFeed } from './play-intent-feed.js'
import { buildPlayIntentDetail } from './play-intent-detail.js'
import { handlePlayIntentFriendInviteInteraction } from './discord-play-intent-friend-invites.js'
import { getPendingResponsePlayIntentPairKeys } from './play-intent-updates-log.js'
import {
  buildCreatorPlayIntentSummaryPreview,
  startScheduledPlayIntentNow,
  respondToPlayIntentFromWeb,
} from './play-intent-notification-responses.js'
import { buildCurrentPlayIntentInvitationPayload } from './play-intent-invitation-payload.js'
import { setTimeout as delay } from 'node:timers/promises'
import { withPlayIntentInvitationDelivery } from './play-intent-invitation-delivery.js'
import { upsertCurrentPlayIntent } from './play-intents.js'

test('participant invitation authorization, concurrency, access, and edit persistence', async () => {
  assertDisposableDatabase()
  const prefix = randomUUID().slice(0, 8)
  const users = await Promise.all(
    [
      'owner',
      'participant',
      'friend',
      'other',
      'no-game',
      'muted',
      'blocked',
    ].map((name) =>
      prisma.user.create({
        data: {
          handle: `${prefix}-${name}`,
          displayName: name,
        },
      }),
    ),
  )
  const [owner, participant, friend, other, noGame, muted, blocked] = users
  assert.ok(
    owner && participant && friend && other && noGame && muted && blocked,
  )
  const game = await prisma.game.create({
    data: {
      slug: `invite-${prefix}`,
      title: 'Invitation test game',
      platforms: { create: { platformLabel: 'PC' } },
    },
  })
  let playIntentId: string | null = null
  const serverId = `invite-test-${prefix}`
  const participantDiscordId = `participant-${prefix}`
  try {
    await prisma.userIdentity.create({
      data: {
        userId: participant.id,
        provider: 'DISCORD',
        providerUserId: participantDiscordId,
      },
    })
    await prisma.userGameInterest.createMany({
      data: users
        .filter((user) => user.id !== noGame.id)
        .map((user) => ({
          userId: user.id,
          gameId: game.id,
          intentType: 'INTERESTED',
        })),
    })
    await prisma.userGameInterestPlatform.createMany({
      data: (
        await prisma.userGameInterest.findMany({ where: { gameId: game.id } })
      ).map((entry) => ({ userGameInterestId: entry.id, platformLabel: 'PC' })),
    })
    await prisma.friend.create({
      data: { userId: owner.id, friendedUserId: participant.id },
    })
    await prisma.friend.createMany({
      data: [friend, noGame, muted, blocked].map((user) => ({
        userId: participant.id,
        friendedUserId: user.id,
      })),
    })
    await prisma.playIntentMute.create({
      data: { userId: muted.id, mutedUserId: owner.id },
    })
    await prisma.block.create({
      data: { userId: blocked.id, blockedUserId: participant.id },
    })
    const created = await upsertCurrentPlayIntent(
      owner.id,
      upsertPlayIntentRequestSchema.parse({
        title: 'Test call',
        selectionMode: 'subset',
        notifyScope: 'specific-friends',
        targetUserIds: [participant.id],
        gameIds: [game.id],
        startAt: new Date(Date.now() + 600000).toISOString(),
        durationMinutes: 60,
      }),
      { skipCreatorSummarySync: true },
    )
    const call = await prisma.playIntent.findUniqueOrThrow({
      where: { id: created.activeIntent.id },
    })
    playIntentId = call.id
    assert.equal(call.allowParticipantInvites, true)
    const prompt = await prisma.notification.findFirstOrThrow({
      where: {
        userId: participant.id,
        playIntentId: call.id,
        type: 'FRIEND_PLAYING',
      },
    })
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /Accept this call/,
    )
    await prisma.notification.update({
      where: { id: prompt.id },
      data: { responseChoice: 'JOIN', respondedAt: new Date() },
    })
    assert.deepEqual(
      (await getPlayIntentInvitableFriends(call.id, participant.id)).map(
        (user) => user.id,
      ),
      [friend.id],
    )
    await startScheduledPlayIntentNow(call.id, owner.id)
    assert.equal(
      (await getPendingResponsePlayIntentPairKeys([call.id], [participant.id]))
        .size,
      0,
    )
    const creatorPreview = buildCreatorPlayIntentSummaryPreview({
      ...(await prisma.playIntent.findUniqueOrThrow({
        where: { id: call.id },
      })),
      user: owner,
      targetDiscordServers: [],
      targetFriends: [{ friendUser: participant }],
      games: [{ game }],
      notifications: await prisma.notification.findMany({
        where: { playIntentId: call.id },
        orderBy: { createdAt: 'desc' },
      }),
    })
    assert.match(JSON.stringify(creatorPreview), /Waiting: 0/)

    assert.equal(
      (await buildPlayIntentDetail(participant.id, call.id))
        ?.viewerResponseChoice,
      'interested',
    )
    assert.equal(
      (await buildPlayIntentFeed(participant.id)).intents.find(
        (intent) => intent.id === call.id,
      )?.viewerResponseChoice,
      'interested',
    )
    assert.deepEqual(
      (await getPlayIntentInvitableFriends(call.id, participant.id)).map(
        (user) => user.id,
      ),
      [friend.id],
    )
    await respondToPlayIntentFromWeb({
      userId: participant.id,
      playIntentId: call.id,
      response: 'DECLINE',
    })
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /Accept this call/,
    )
    await respondToPlayIntentFromWeb({
      userId: participant.id,
      playIntentId: call.id,
      response: 'JOIN',
    })
    const legacyAnswer = await prisma.notification.create({
      data: {
        userId: participant.id,
        playIntentId: call.id,
        type: 'SCHEDULED_PLAY_INTENT_CONFIRMED',
        title: 'Legacy answer',
        body: 'Legacy answer',
        responseChoice: 'DECLINE',
        respondedAt: new Date(Date.now() + 1000),
      },
    })
    const responseMigration = await readFile(
      new URL(
        '../../prisma/migrations/20261008123000_audience_response_resets/migration.sql',
        import.meta.url,
      ),
      'utf8',
    )
    const normalizationStatements = responseMigration
      .slice(responseMigration.indexOf('WITH anchors AS'))
      .split(';')
      .filter((statement) => statement.trim())
    for (const statement of normalizationStatements) {
      await prisma.$executeRawUnsafe(statement)
    }
    assert.equal(
      (await buildPlayIntentDetail(participant.id, call.id))
        ?.viewerResponseChoice,
      'pass',
    )
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /Accept this call/,
    )
    // An unanswered invitation and a later legacy acceptance must require a new answer.
    await prisma.notification.update({
      where: { id: prompt.id },
      data: {
        responseChoice: null,
        respondedAt: null,
        runningLateAt: new Date(),
        runningLateMinutes: 15,
      },
    })
    await prisma.notification.update({
      where: { id: legacyAnswer.id },
      data: {
        responseChoice: 'JOIN',
        respondedAt: new Date(),
      },
    })
    for (const statement of normalizationStatements) {
      await prisma.$executeRawUnsafe(statement)
    }
    const ambiguousPrompt = await prisma.notification.findUniqueOrThrow({
      where: { id: prompt.id },
    })
    assert.equal(ambiguousPrompt.responseChoice, null)
    assert.equal(ambiguousPrompt.respondedAt, null)
    assert.equal(ambiguousPrompt.runningLateAt, null)
    assert.equal(ambiguousPrompt.runningLateMinutes, null)
    assert.ok(ambiguousPrompt.responseResetAt)
    assert.equal(
      (await buildPlayIntentDetail(participant.id, call.id))
        ?.viewerResponseChoice,
      null,
    )
    assert.equal(
      (await buildPlayIntentFeed(participant.id)).intents.find(
        (intent) => intent.id === call.id,
      )?.viewerResponseChoice,
      null,
    )
    assert.equal(
      (await getPendingResponsePlayIntentPairKeys([call.id], [participant.id]))
        .size,
      1,
    )
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /Accept this call/,
    )
    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, friend.id),
      /Accept this call/,
    )
    assert.equal(
      await prisma.playIntentParticipantInvite.count({
        where: { playIntentId: call.id },
      }),
      0,
    )

    // Reacceptance restores access even while the old informational answer remains stored.
    await respondToPlayIntentFromWeb({
      userId: participant.id,
      playIntentId: call.id,
      response: 'JOIN',
    })
    assert.equal(
      (await buildPlayIntentDetail(participant.id, call.id))
        ?.viewerResponseChoice,
      'interested',
    )
    assert.deepEqual(
      (await getPlayIntentInvitableFriends(call.id, participant.id)).map(
        (user) => user.id,
      ),
      [friend.id],
    )
    for (const statement of normalizationStatements) {
      await prisma.$executeRawUnsafe(statement)
    }
    assert.equal(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: prompt.id },
        })
      ).responseChoice,
      'JOIN',
    )
    await prisma.notification.delete({ where: { id: legacyAnswer.id } })

    const dmReplies: { content?: string; components?: unknown }[] = []
    const dmOpen = {
      customId: `ctp-friend-invite:${call.id}:open`,
      user: { id: participantDiscordId },
      deferred: true,
      replied: false,
      isStringSelectMenu: () => false,
      deferReply: async () => undefined,
      editReply: async (payload: {
        content?: string
        components?: unknown
      }) => {
        dmReplies.push(payload)
      },
    } as unknown as ButtonInteraction
    await handlePlayIntentFriendInviteInteraction(dmOpen)
    assert.match(dmReplies.at(-1)?.content ?? '', /Choose one/)
    assert.ok(JSON.stringify(dmReplies.at(-1)?.components).includes(friend.id))
    assert.ok(
      !JSON.stringify(dmReplies.at(-1)?.components).includes(blocked.id),
    )
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, other.id),
      /Accept this call/,
    )
    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, other.id),
      /own friends/,
    )
    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, noGame.id),
      /not eligible/,
    )
    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, muted.id),
      /not eligible/,
    )
    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, blocked.id),
      /not eligible/,
    )
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { allowParticipantInvites: false },
    })
    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, friend.id),
      /disabled/,
    )
    const staleSelect = {
      customId: `ctp-friend-invite:${call.id}:select`,
      user: { id: participantDiscordId },
      deferred: true,
      replied: false,
      values: [friend.id],
      isStringSelectMenu: () => true,
      editReply: async (payload: {
        content?: string
        components?: unknown
      }) => {
        dmReplies.push(payload)
      },
    } as unknown as StringSelectMenuInteraction
    await handlePlayIntentFriendInviteInteraction(staleSelect)
    assert.match(dmReplies.at(-1)?.content ?? '', /disabled/)
    assert.equal(
      await prisma.playIntentParticipantInvite.count({
        where: { playIntentId: call.id },
      }),
      0,
    )
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { allowParticipantInvites: true },
    })
    // Freeze the organizer's notification snapshot while the same friend is invited.
    await prisma.friend.create({
      data: { userId: owner.id, friendedUserId: friend.id },
    })
    let snapshotReady!: () => void
    let releaseSnapshot!: () => void
    const snapshotLoaded = new Promise<void>((resolve) => {
      snapshotReady = resolve
    })
    const snapshotReleased = new Promise<void>((resolve) => {
      releaseSnapshot = resolve
    })
    const originalFindMany = prisma.notification.findMany.bind(
      prisma.notification,
    )
    const snapshotFindMany = async (
      args: Parameters<typeof originalFindMany>[0],
    ) => {
      const rows = await originalFindMany(args)
      if (
        args?.where?.playIntentId === call.id &&
        args.where.type === NotificationType.FRIEND_PLAYING
      ) {
        snapshotReady()
        await snapshotReleased
      }
      return rows
    }
    prisma.notification.findMany =
      snapshotFindMany as typeof prisma.notification.findMany
    const editRequest = upsertPlayIntentRequestSchema.parse({
      playIntentId: call.id,
      title: 'Concurrent edit',
      selectionMode: 'subset',
      notifyScope: 'specific-friends',
      targetUserIds: [participant.id, friend.id],
      gameIds: [game.id],
      durationMinutes: 60,
    })
    const editing = upsertCurrentPlayIntent(owner.id, editRequest, {
      skipCreatorSummarySync: true,
    })
    // Attach the rejection assertion before releasing the editor.
    const rejectedEdit = assert.rejects(editing, /participant just invited/)
    await snapshotLoaded
    let results: Awaited<ReturnType<typeof inviteFriendToPlayIntent>>[]
    try {
      results = await Promise.all([
        inviteFriendToPlayIntent(call.id, participant.id, friend.id),
        inviteFriendToPlayIntent(call.id, participant.id, friend.id),
      ])
    } finally {
      prisma.notification.findMany = originalFindMany
      releaseSnapshot()
    }
    await rejectedEdit

    assert.equal(results.filter((result) => result.invited).length, 1)
    assert.equal(
      await prisma.playIntentParticipantInvite.count({
        where: { playIntentId: call.id },
      }),
      1,
    )
    assert.equal(
      await prisma.notification.count({
        where: {
          playIntentId: call.id,
          userId: friend.id,
          type: 'FRIEND_PLAYING',
        },
      }),
      1,
    )
    assert.ok(
      (await buildPlayIntentFeed(friend.id)).intents.some(
        (intent) => intent.id === call.id && intent.appliesToViewer,
      ),
    )
    assert.equal(
      (await buildPlayIntentDetail(friend.id, call.id))?.appliesToViewer,
      true,
    )
    await upsertCurrentPlayIntent(
      owner.id,
      upsertPlayIntentRequestSchema.parse({
        playIntentId: call.id,
        title: 'Edited call',
        selectionMode: 'subset',
        notifyScope: 'specific-friends',
        targetUserIds: [participant.id],
        gameIds: [game.id],
        durationMinutes: 60,
        allowParticipantInvites: false,
      }),
      { skipCreatorSummarySync: true },
    )
    assert.equal(
      (await buildPlayIntentDetail(friend.id, call.id))?.appliesToViewer,
      true,
    )
    assert.equal(
      (await buildPlayIntentDetail(participant.id, call.id))
        ?.allowParticipantInvites,
      false,
    )
    await upsertCurrentPlayIntent(
      owner.id,
      upsertPlayIntentRequestSchema.parse({
        playIntentId: call.id,
        title: 'Older client edit',
        selectionMode: 'subset',
        notifyScope: 'specific-friends',
        targetUserIds: [participant.id],
        gameIds: [game.id],
        durationMinutes: 60,
      }),
      { skipCreatorSummarySync: true },
    )
    assert.equal(
      (await buildPlayIntentDetail(participant.id, call.id))
        ?.allowParticipantInvites,
      false,
    )
    assert.match(
      (
        await prisma.notification.findFirstOrThrow({
          where: {
            playIntentId: call.id,
            userId: friend.id,
            type: 'FRIEND_PLAYING',
          },
        })
      ).body,
      /Invited by: participant/,
    )

    await assert.rejects(
      inviteFriendToPlayIntent(call.id, participant.id, friend.id),
      /disabled/,
    )
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { allowParticipantInvites: true },
    })
    assert.ok(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: prompt.id },
        })
      ).responseResetAt,
    )
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /Accept this call/,
    )
    await prisma.discordServer.create({
      data: { id: serverId, name: 'Test server' },
    })
    const space = await prisma.playIntentDiscordSpace.create({
      data: { playIntentId: call.id, serverId },
    })
    // The newly invited friend becomes a participant and can invite their own friend.
    await prisma.notification.updateMany({
      where: {
        playIntentId: call.id,
        userId: friend.id,
        type: 'FRIEND_PLAYING',
      },
      data: { responseChoice: 'JOIN', respondedAt: new Date() },
    })
    await prisma.friend.create({
      data: { userId: friend.id, friendedUserId: other.id },
    })
    await prisma.userIdentity.create({
      data: {
        userId: friend.id,
        provider: 'DISCORD',
        providerUserId: `friend-${prefix}`,
      },
    })
    const selectReplies: { content?: string; components?: unknown }[] = []
    const selectInteraction = {
      customId: `ctp-friend-invite:${call.id}:select`,
      user: { id: `friend-${prefix}` },
      deferred: true,
      replied: false,
      values: [other.id],
      message: {
        id: `picker-${prefix}`,
        content: 'Choose one friend',
        embeds: [],
        components: buildPlayIntentFriendInvitePicker(call.id, [
          {
            id: other.id,
            displayName: other.displayName,
            handle: other.handle,
          },
        ]).components,
      },
      isStringSelectMenu: () => true,
      editReply: async (payload: {
        content?: string
        components?: unknown
      }) => {
        selectReplies.push(payload)
      },
      fetchReply: async () => ({ components: [] }),
    } as unknown as StringSelectMenuInteraction
    await handlePlayIntentFriendInviteInteraction(selectInteraction)
    assert.match(selectReplies.at(-1)?.content ?? '', /Friend invited/)
    assert.equal(
      await prisma.playIntentParticipantInvite.count({
        where: { playIntentId: call.id, inviteeUserId: other.id },
      }),
      1,
    )
    assert.equal(
      await prisma.playIntentDiscordSpaceAccessGrant.count({
        where: { spaceId: space.id, userId: other.id },
      }),
      1,
    )
    await prisma.notification.deleteMany({
      where: {
        playIntentId: call.id,
        userId: other.id,
        type: 'FRIEND_PLAYING',
      },
    })
    assert.equal(
      (await inviteFriendToPlayIntent(call.id, friend.id, other.id)).invited,
      false,
    )
    assert.deepEqual(
      await getPlayIntentInvitableFriends(call.id, friend.id),
      [],
    )
    // A stale picker must not grant permission after its participant withdraws.
    await prisma.notification.update({
      where: { id: prompt.id },
      data: { responseChoice: 'DECLINE' },
    })
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /Accept this call/,
    )
    await prisma.notification.update({
      where: { id: prompt.id },
      data: { responseChoice: 'JOIN' },
    })

    // Both senders reload tracking after acquiring the shared database delivery lock.
    let firstStarted!: () => void
    let releaseFirst!: () => void
    const firstReady = new Promise<void>((resolve) => {
      firstStarted = resolve
    })
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstDelivery = withPlayIntentInvitationDelivery(
      prompt.id,
      async () => {
        firstStarted()
        await firstReleased
        // Ownership survives a database idle-transaction timeout because it is a session lock.
        await delay(250)
        await prisma.notification.update({
          where: { id: prompt.id },
          data: {
            discordDmChannelId: 'test-channel',
            discordDmMessageId: 'test-message',
          },
        })
      },
    )
    await firstReady
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { headline: 'Current headline' },
    })
    await prisma.notification.update({
      where: { id: prompt.id },
      data: { responseChoice: 'JOIN', respondedAt: new Date() },
    })
    const secondDelivery = withPlayIntentInvitationDelivery(
      prompt.id,
      async (notification) => {
        assert.equal(notification.discordDmMessageId, 'test-message')
        assert.equal(notification.responseChoice, 'JOIN')
        const payload =
          await buildCurrentPlayIntentInvitationPayload(notification)
        assert.match(JSON.stringify(payload.embeds), /Current headline/)
        assert.ok(!JSON.stringify(payload.components).includes('custom_id'))
      },
    )
    releaseFirst()
    await Promise.all([firstDelivery, secondDelivery])
    // Terminate only this disposable database's pinned lock session during paused work.
    let disconnectedDeliveryReady!: () => void
    let releaseDisconnectedDelivery!: () => void
    const disconnectReady = new Promise<void>((resolve) => {
      disconnectedDeliveryReady = resolve
    })
    const disconnectReleased = new Promise<void>((resolve) => {
      releaseDisconnectedDelivery = resolve
    })
    const expectedErrors = mock.method(console, 'error', () => undefined)
    try {
      const disconnectedDelivery = withPlayIntentInvitationDelivery(
        prompt.id,
        async (_, signal) => {
          disconnectedDeliveryReady()
          await disconnectReleased
          assert.equal(signal.aborted, true)
        },
      )
      const ownershipLost = assert.rejects(
        disconnectedDelivery,
        /terminating connection|Connection terminated/,
      )
      await disconnectReady
      await prisma.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'game-is-up-invitation-delivery' AND datname = current_database()`
      await delay(50)
      releaseDisconnectedDelivery()
      await ownershipLost
      await withPlayIntentInvitationDelivery(prompt.id, async (_, signal) => {
        assert.equal(signal.aborted, false)
      })
    } finally {
      releaseDisconnectedDelivery()
      expectedErrors.mock.restore()
    }
    // Expiry can archive a chain before an in-flight send publishes its references.
    let duplicateEndedNotificationId: string | null = null
    await withPlayIntentInvitationDelivery(prompt.id, async () => {
      await prisma.playIntent.update({
        where: { id: call.id },
        data: {
          expiresAt: new Date(Date.now() - 1000),
          dmChainEndedAt: new Date(),
        },
      })
      await prisma.notification.update({
        where: { id: prompt.id },
        data: {
          discordDmChannelId: 'test-channel',
          discordDmMessageId: 'late-ended-message',
        },
      })
      const duplicate = await prisma.notification.create({
        data: {
          userId: participant.id,
          playIntentId: call.id,
          type: 'FRIEND_PLAYING',
          title: 'Late duplicate',
          body: 'Late duplicate',
          discordDmChannelId: 'test-channel',
          discordDmMessageId: 'duplicate-ended-message',
        },
      })
      duplicateEndedNotificationId = duplicate.id
    })
    assert.ok(duplicateEndedNotificationId)
    // Archival must revisit the ended chain and collapse the newly tracked duplicates.
    assert.equal(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: duplicateEndedNotificationId },
        })
      ).discordDmMessageId,
      null,
    )
    assert.ok(
      (await prisma.playIntent.findUniqueOrThrow({ where: { id: call.id } }))
        .dmChainEndedAt,
    )
    let staleSendAttempted = false
    await withPlayIntentInvitationDelivery(prompt.id, async () => {
      staleSendAttempted = true
    })
    assert.equal(staleSendAttempted, false)
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { expiresAt: new Date(Date.now() + 3600000) },
    })
    await withPlayIntentInvitationDelivery(prompt.id, async () => {
      await prisma.playIntent.update({
        where: { id: call.id },
        data: { deletedAt: new Date() },
      })
      await prisma.notification.update({
        where: { id: prompt.id },
        data: {
          discordDmChannelId: 'test-channel',
          discordDmMessageId: 'late-deleted-message',
        },
      })
    })
    assert.equal(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: prompt.id },
        })
      ).discordDmMessageId,
      null,
    )
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /no longer active/,
    )
    await prisma.playIntent.update({
      where: { id: call.id },
      data: { allowParticipantInvites: true, deletedAt: new Date() },
    })
    await assert.rejects(
      getPlayIntentInvitableFriends(call.id, participant.id),
      /no longer active/,
    )
  } finally {
    if (playIntentId) {
      await prisma.playIntent.delete({ where: { id: playIntentId } })
    }
    await prisma.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    })
    await prisma.game.delete({ where: { id: game.id } })
    await prisma.discordServer.deleteMany({ where: { id: serverId } })
    await prisma.$disconnect()
  }
})
