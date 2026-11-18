import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlayIntentDiscordSpaceInviteContent } from './play-intent-discord-space-invite-dm.js'

const baseOptions = {
  creatorDisplayName: 'Ryan',
  serverLabel: "Game's Up",
  inviteUrl: 'https://discord.gg/test-invite',
}

test('the server invite DM explains the ask and carries the invite URL', () => {
  const content = buildPlayIntentDiscordSpaceInviteContent({
    ...baseOptions,
    textChannelName: 'chat-friday-night-helldivers',
    voiceChannelName: 'voice-friday-night-helldivers',
  })

  assert.match(content, /^🎟 One Step Left/m)
  assert.match(content, /Ryan's call to play/)
  assert.match(content, /Game's Up/)
  assert.match(content, /https:\/\/discord\.gg\/test-invite/)
  assert.match(
    content,
    /chat-friday-night-helldivers and voice-friday-night-helldivers/,
  )
  assert.match(
    content,
    /unlock the call's private text and voice channels for you automatically/,
  )
})

test('the server invite DM stays push-safe plain text', () => {
  const content = buildPlayIntentDiscordSpaceInviteContent({
    ...baseOptions,
    textChannelName: 'chat-friday-night-helldivers',
    voiceChannelName: null,
  })

  assert.doesNotMatch(content, /-# /)
  assert.doesNotMatch(content, /<@/)
  assert.doesNotMatch(content, /^#{1,3}\s/m)
})

test('the server invite DM omits the channel line when no channel names are known', () => {
  const content = buildPlayIntentDiscordSpaceInviteContent({
    ...baseOptions,
    textChannelName: null,
    voiceChannelName: null,
  })

  assert.doesNotMatch(content, /The channels for this call are/)
  assert.match(content, /https:\/\/discord\.gg\/test-invite/)
})
