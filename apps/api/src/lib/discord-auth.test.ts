/**
 * Unit test for what Discord sign-in asks for: the user's identity and their servers, and not
 * their email address, which Game's Up has no use for.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DISCORD_REQUESTED_SCOPES } from './discord-auth.js'

test('sign-in requests identity and servers only, never the email address', () => {
  assert.deepEqual([...DISCORD_REQUESTED_SCOPES], ['identify', 'guilds'])
})
