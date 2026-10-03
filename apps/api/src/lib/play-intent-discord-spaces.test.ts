import assert from 'node:assert/strict'
import test from 'node:test'

import { PlayIntentDiscordSpaceStatus } from '@prisma/client'

import {
  buildComplementarySpaceNames,
  handlePlayIntentDiscordSpaceMemberJoin,
  resolveComplementarySpaceDeleteAfter,
  shouldBackfillLegacyPlayIntentDiscordSpace,
  sweepBackfillLegacyPlayIntentDiscordSpaces,
  sweepDeleteDuePlayIntentDiscordSpaces
} from './play-intent-discord-spaces.js'

type MemberJoinDependencies = NonNullable<Parameters<typeof handlePlayIntentDiscordSpaceMemberJoin>[1]>
type MembershipUpsertArgs = Parameters<MemberJoinDependencies['prisma']['discordServerMembership']['upsert']>[0]
type AccessGrantUpdateArgs = Parameters<MemberJoinDependencies['prisma']['playIntentDiscordSpaceAccessGrant']['update']>[0]
type SpaceUpdateManyArgs = Parameters<MemberJoinDependencies['prisma']['playIntentDiscordSpace']['updateMany']>[0]

test('temporary Discord channel names use consistent prefixes and category phrasing', () => {
  const names = buildComplementarySpaceNames({
    id: 'abcdef123456',
    headline: 'Friday Night Helldivers',
    user: {
      displayName: 'Ryan'
    }
  })

  assert.equal(names.roleName, 'ctp-friday-night-helldivers-abcdef')
  assert.equal(names.categoryName, 'Friday Night Helldivers by Ryan abcdef')
  assert.equal(names.textChannelName, 'chat-friday-night-helldivers-abcdef')
  assert.equal(names.voiceChannelName, 'voice-friday-night-helldivers-abcdef')
})

test('retained Discord spaces delete 12 hours after the latest activity', () => {
  const baseTime = new Date('2026-05-14T12:00:00.000Z')
  const earlierActivity = new Date('2026-05-14T11:00:00.000Z')
  const laterActivity = new Date('2026-05-14T15:30:00.000Z')

  assert.equal(resolveComplementarySpaceDeleteAfter(baseTime).toISOString(), '2026-05-15T00:00:00.000Z')
  assert.equal(resolveComplementarySpaceDeleteAfter(baseTime, earlierActivity).toISOString(), '2026-05-15T00:00:00.000Z')
  assert.equal(resolveComplementarySpaceDeleteAfter(baseTime, laterActivity).toISOString(), '2026-05-15T03:30:00.000Z')
})

test('legacy Discord-space backfill only targets active voice-backed spaces missing category or text channels', () => {
  assert.equal(shouldBackfillLegacyPlayIntentDiscordSpace({
    id: 'space-1',
    status: PlayIntentDiscordSpaceStatus.ACTIVE,
    categoryChannelId: null,
    textChannelId: 'text-1',
    voiceChannelId: 'voice-1'
  }), true)

  assert.equal(shouldBackfillLegacyPlayIntentDiscordSpace({
    id: 'space-2',
    status: PlayIntentDiscordSpaceStatus.ACTIVE,
    categoryChannelId: 'category-1',
    textChannelId: null,
    voiceChannelId: 'voice-1'
  }), true)

  assert.equal(shouldBackfillLegacyPlayIntentDiscordSpace({
    id: 'space-3',
    status: PlayIntentDiscordSpaceStatus.ACTIVE,
    categoryChannelId: 'category-1',
    textChannelId: 'text-1',
    voiceChannelId: 'voice-1'
  }), false)

  assert.equal(shouldBackfillLegacyPlayIntentDiscordSpace({
    id: 'space-4',
    status: PlayIntentDiscordSpaceStatus.RETAINED,
    categoryChannelId: null,
    textChannelId: null,
    voiceChannelId: 'voice-1'
  }), false)

  assert.equal(shouldBackfillLegacyPlayIntentDiscordSpace({
    id: 'space-5',
    status: PlayIntentDiscordSpaceStatus.ACTIVE,
    categoryChannelId: null,
    textChannelId: null,
    voiceChannelId: null
  }), false)
})

test('legacy Discord-space backfill reprovisions only the missing-channel candidates it receives', async () => {
  const reprovisionedSpaceIds: string[] = []

  await sweepBackfillLegacyPlayIntentDiscordSpaces({
    findSpaces: async () => ([
      {
        id: 'space-1',
        status: PlayIntentDiscordSpaceStatus.ACTIVE,
        categoryChannelId: null,
        textChannelId: 'text-1',
        voiceChannelId: 'voice-1'
      },
      {
        id: 'space-2',
        status: PlayIntentDiscordSpaceStatus.ACTIVE,
        categoryChannelId: 'category-1',
        textChannelId: 'text-1',
        voiceChannelId: 'voice-1'
      },
      {
        id: 'space-3',
        status: PlayIntentDiscordSpaceStatus.PROVISION_FAILED,
        categoryChannelId: null,
        textChannelId: null,
        voiceChannelId: 'voice-3'
      }
    ]),
    provisionSpace: async (spaceId) => {
      reprovisionedSpaceIds.push(spaceId)
    }
  })

  assert.deepEqual(reprovisionedSpaceIds, ['space-1'])
})

test('delete sweep skips due spaces while retained voice members are still active', async () => {
  const deletedSpaceIds: string[] = []

  await sweepDeleteDuePlayIntentDiscordSpaces({
    findDueSpaces: async () => ([
      {
        id: 'space-1',
        voiceChannelId: 'voice-1'
      },
      {
        id: 'space-2',
        voiceChannelId: 'voice-2'
      }
    ]),
    hasActiveVoiceUsers: async (voiceChannelId) => voiceChannelId === 'voice-1',
    deleteSpace: async (spaceId) => {
      deletedSpaceIds.push(spaceId)
      return { status: 'deleted' as const }
    }
  })

  assert.deepEqual(deletedSpaceIds, ['space-2'])
})

test('guild member join upserts membership and clears creator recovery errors after granting access', async () => {
  const membershipUpserts: MembershipUpsertArgs[] = []
  const accessGrantUpdates: AccessGrantUpdateArgs[] = []
  const spaceErrorClears: SpaceUpdateManyArgs[] = []
  let invalidationCount = 0
  const refreshedUserIds: string[][] = []

  const dependencies = {
    discordServerId: 'guild-1',
    prisma: {
      userIdentity: {
        findUnique: async () => ({ userId: 'user-1' })
      },
      playIntentDiscordSpace: {
        findMany: async () => [],
        updateMany: async (args: SpaceUpdateManyArgs) => {
          spaceErrorClears.push(args)
          return { count: 1 }
        },
        update: async () => ({})
      },
      playIntentDiscordSpaceAccessGrant: {
        findMany: async () => ([{
          spaceId: 'space-1',
          source: 'CREATOR',
          roleGrantedAt: null,
          joinedViaInviteAt: null,
          space: {
            roleId: 'role-1'
          }
        }]),
        update: async (args: AccessGrantUpdateArgs) => {
          accessGrantUpdates.push(args)
          return {}
        }
      },
      discordServerMembership: {
        upsert: async (args: MembershipUpsertArgs) => {
          membershipUpserts.push(args)
          return {}
        }
      }
    },
    tryGrantRoleToMember: async () => ({
      ok: true,
      reason: 'granted',
      message: null
    }),
    publishPlayIntentInvalidation: () => {
      invalidationCount += 1
    },
    refreshTrackedRecipientDirectMessages: async (userIds: string[]) => {
      refreshedUserIds.push(userIds)
    }
  } as unknown as MemberJoinDependencies

  await handlePlayIntentDiscordSpaceMemberJoin({
    serverId: 'guild-1',
    discordUserId: 'discord-user-1'
  }, dependencies)

  assert.deepEqual(membershipUpserts, [{
    where: {
      userId_serverId: {
        userId: 'user-1',
        serverId: 'guild-1'
      }
    },
    update: {},
    create: {
      userId: 'user-1',
      serverId: 'guild-1'
    }
  }])

  assert.equal(accessGrantUpdates.length, 1)
  assert.equal(accessGrantUpdates[0]?.data.inServer, true)
  assert.ok(accessGrantUpdates[0]?.data.roleGrantedAt instanceof Date)
  assert.ok(accessGrantUpdates[0]?.data.joinedViaInviteAt instanceof Date)

  assert.deepEqual(spaceErrorClears, [{
    where: {
      id: {
        in: ['space-1']
      },
      lastSyncError: {
        in: [
          'The call-to-play creator is not currently in the Game\'s Up Discord server. Join the server to reveal the temporary Discord channel.',
          'The call-to-play creator could not be granted the temporary Discord channel role. Check that the Game\'s Up bot can manage roles in the Discord server.'
        ]
      }
    },
    data: {
      lastSyncError: null
    }
  }])

  assert.equal(invalidationCount, 1)
  assert.deepEqual(refreshedUserIds, [['user-1']])
})

test('guild member join returns early for other servers', async () => {
  let called = false

  const dependencies = {
    discordServerId: 'guild-1',
    prisma: {
      userIdentity: {
        findUnique: async () => {
          called = true
          return null
        }
      }
    },
    tryGrantRoleToMember: async () => {
      called = true
      return {
        ok: true,
        reason: 'granted',
        message: null
      }
    },
    publishPlayIntentInvalidation: () => {
      called = true
    }
  } as unknown as MemberJoinDependencies

  await handlePlayIntentDiscordSpaceMemberJoin({
    serverId: 'guild-2',
    discordUserId: 'discord-user-1'
  }, dependencies)

  assert.equal(called, false)
})

test('untracked server newcomers are not granted a role inferred from invite usage', async () => {
  let roleGrants = 0
  const dependencies = {
    discordServerId: 'guild-1',
    prisma: {
      userIdentity: { findUnique: async () => null }
    },
    tryGrantRoleToMember: async () => {
      roleGrants += 1
      return { ok: true, reason: 'granted', message: null }
    }
  } as unknown as MemberJoinDependencies

  await handlePlayIntentDiscordSpaceMemberJoin({
    serverId: 'guild-1',
    discordUserId: 'untracked-discord-user'
  }, dependencies)

  assert.equal(roleGrants, 0)
})
