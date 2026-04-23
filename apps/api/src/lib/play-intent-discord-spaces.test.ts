import assert from 'node:assert/strict'
import test from 'node:test'

import { handlePlayIntentDiscordSpaceMemberJoin } from './play-intent-discord-spaces.js'

type MemberJoinDependencies = NonNullable<Parameters<typeof handlePlayIntentDiscordSpaceMemberJoin>[1]>
type MembershipUpsertArgs = Parameters<MemberJoinDependencies['prisma']['discordServerMembership']['upsert']>[0]
type AccessGrantUpdateArgs = Parameters<MemberJoinDependencies['prisma']['playIntentDiscordSpaceAccessGrant']['update']>[0]
type SpaceUpdateManyArgs = Parameters<MemberJoinDependencies['prisma']['playIntentDiscordSpace']['updateMany']>[0]

test('guild member join upserts membership and clears creator recovery errors after granting access', async () => {
  const membershipUpserts: MembershipUpsertArgs[] = []
  const accessGrantUpdates: AccessGrantUpdateArgs[] = []
  const spaceErrorClears: SpaceUpdateManyArgs[] = []
  let invalidationCount = 0

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
    fetchGuildInviteUses: async () => new Map(),
    tryGrantRoleToMember: async () => ({
      ok: true,
      reason: 'granted',
      message: null
    }),
    publishPlayIntentInvalidation: () => {
      invalidationCount += 1
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
    fetchGuildInviteUses: async () => {
      called = true
      return new Map()
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