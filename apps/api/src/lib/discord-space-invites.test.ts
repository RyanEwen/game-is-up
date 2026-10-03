import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDiscordSpaceInvite,
  ensurePlayIntentDiscordSpaceInvite,
  inviteGrantsDiscordSpaceRole,
  sweepUpgradePlayIntentDiscordSpaceInvites
} from './discord-space-invites.js'

test('shareable space invites grant the channel role without restricting recipients', async () => {
  const invite = await createDiscordSpaceInvite('public-channel', 'space-role', {
    post: async (route, options) => {
      assert.equal(route, '/channels/public-channel/invites')
      assert.deepEqual(options?.body, {
        max_age: 0,
        max_uses: 0,
        temporary: false,
        unique: true,
        role_ids: ['space-role']
      })
      return { code: 'role-invite', uses: 0 }
    }
  })

  assert.equal(invite.url, 'https://discord.gg/role-invite')
})

test('legacy invites and invites granting additional roles cannot be reused', () => {
  assert.equal(inviteGrantsDiscordSpaceRole({ code: 'legacy' }, 'space-role'), false)
  assert.equal(inviteGrantsDiscordSpaceRole({ code: 'empty', roles: [] }, 'space-role'), false)
  assert.equal(inviteGrantsDiscordSpaceRole({ code: 'other', roles: [{ id: 'other-role' }] }, 'space-role'), false)
  assert.equal(inviteGrantsDiscordSpaceRole({
    code: 'extra', roles: [{ id: 'space-role' }, { id: 'other-role' }]
  }, 'space-role'), false)
  assert.equal(inviteGrantsDiscordSpaceRole({
    code: 'correct', roles: [{ id: 'space-role' }]
  }, 'space-role'), true)
})

test('upgrade sweep refreshes existing Discord messages only when an invite changes', async () => {
  const spaces = ['legacy', 'current'].map((inviteCode) => ({
    id: inviteCode,
    serverId: 'guild',
    roleId: 'space-role',
    textChannelId: 'text-channel',
    inviteCode,
    inviteUseCount: 0
  }))
  let refreshes = 0

  await sweepUpgradePlayIntentDiscordSpaceInvites({
    findSpaces: async () => spaces,
    ensureInvite: async (space) => ({ code: space.inviteCode === 'legacy' ? 'replacement' : 'current' }),
    refreshMessages: async () => { refreshes += 1 }
  })
  assert.equal(refreshes, 1)

  await sweepUpgradePlayIntentDiscordSpaceInvites({
    findSpaces: async () => spaces,
    ensureInvite: async (space) => ({ code: space.inviteCode! }),
    refreshMessages: async () => { refreshes += 1 }
  })
  assert.equal(refreshes, 1)
})

const legacySpace = {
  id: 'space',
  serverId: 'guild',
  roleId: 'space-role',
  textChannelId: 'private-text',
  inviteCode: 'old-invite',
  inviteUseCount: 3
}

test('legacy invite replacement is persisted before the old invite is retired', async () => {
  const phases: string[] = []
  const invite = await ensurePlayIntentDiscordSpaceInvite(legacySpace, {
    rest: {
      get: async () => ({ code: 'old-invite' }),
      post: async (route) => {
        assert.equal(route, '/channels/public-text/invites')
        phases.push('create')
        return { code: 'new-invite' }
      }
    },
    resolvePublicChannelId: async () => 'public-text',
    saveInvite: async (id, replacement) => {
      assert.equal(id, 'space')
      assert.equal(replacement.url, 'https://discord.gg/new-invite')
      assert.equal(replacement.uses, 0)
      phases.push('save')
    },
    retireInvite: async (code) => {
      assert.equal(code, 'old-invite')
      phases.push('retire')
    }
  })

  assert.equal(invite.code, 'new-invite')
  assert.deepEqual(phases, ['create', 'save', 'retire'])
})

test('a working role invite keeps its shared URL and is not rewritten', async () => {
  const unexpectedMutation = async () => { assert.fail('working invite must remain unchanged') }
  const invite = await ensurePlayIntentDiscordSpaceInvite(legacySpace, {
    rest: {
      get: async () => ({ code: 'old-invite', roles: [{ id: 'space-role' }] }),
      post: unexpectedMutation
    },
    resolvePublicChannelId: unexpectedMutation,
    saveInvite: unexpectedMutation,
    retireInvite: unexpectedMutation
  })

  assert.equal(invite.url, 'https://discord.gg/old-invite')
  assert.equal(invite.uses, 3)
})

test('failed replacement persistence leaves the old invite intact', async () => {
  const retiredCodes: Array<string | null | undefined> = []
  await assert.rejects(ensurePlayIntentDiscordSpaceInvite(legacySpace, {
    rest: {
      get: async () => ({ code: 'old-invite' }),
      post: async () => ({ code: 'replacement' })
    },
    resolvePublicChannelId: async () => 'public-text',
    saveInvite: async () => { throw new Error('Database unavailable') },
    retireInvite: async (code) => { retiredCodes.push(code) }
  }), /Database unavailable/)

  assert.deepEqual(retiredCodes, ['replacement'])
})


test('invite inspection failures do not prevent the rest of the cleanup sweep', async (context) => {
  const errors: unknown[][] = []
  context.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args) })

  await sweepUpgradePlayIntentDiscordSpaceInvites({
    findSpaces: async () => { throw new Error('Discord unavailable') },
    ensureInvite: async () => { assert.fail('lookup failure must not mutate invites') }
  })

  assert.equal(errors.length, 1)
})

test('one failed upgrade does not prevent other spaces from receiving working invites', async (context) => {
  context.mock.method(console, 'error', () => {})
  const upgraded: string[] = []
  let refreshes = 0

  await sweepUpgradePlayIntentDiscordSpaceInvites({
    findSpaces: async () => [legacySpace, { ...legacySpace, id: 'second-space' }],
    ensureInvite: async (space) => {
      if (space.id === 'space') {
        throw new Error('Missing permissions')
      }

      upgraded.push(space.id)
      return { code: 'replacement' }
    },
    refreshMessages: async () => { refreshes += 1 }
  })

  assert.deepEqual(upgraded, ['second-space'])
  assert.equal(refreshes, 1)
})
