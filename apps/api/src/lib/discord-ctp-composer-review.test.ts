/** Regression coverage for visible posting blockers in the Discord composer. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DiscordCtpComposerStartMode,
  DiscordCtpComposerStep,
  DiscordCtpComposerVoiceMode,
  PlayIntentScope,
  type DiscordCtpComposerDraft,
  type PrismaClient
} from '@prisma/client'
import type { ButtonInteraction } from 'discord.js'

// Match the service-test convention: install a plain client stub before
// loading the composer so these checks cannot reach a database or Discord.
const prisma = {
  game: { findMany: async () => [{ title: 'Game' }] },
  discordServer: { findMany: async () => [{ name: 'Selected server' }] },
  userIdentity: { findUnique: async () => ({ user }) },
  discordCtpComposerDraft: { findFirst: async () => draft }
}
globalThis.__gameIsUpPrisma__ = prisma as unknown as PrismaClient
const { renderComposerView, handleCtpComposerButtonInteraction } = await import('./discord-ctp-composer.js')

const draft: DiscordCtpComposerDraft = {
  id: '12345678-1234-1234-1234-123456789abc',
  userId: 'creator',
  discordUserId: 'discord-creator',
  contextKey: 'manual',
  autoPlayPromptId: null,
  step: DiscordCtpComposerStep.REVIEW,
  title: '',
  allowParticipantInvites: true,
  gameIds: ['game'],
  gamePage: 0,
  notifyScope: PlayIntentScope.SPECIFIC_DISCORD_SERVER,
  targetUserIds: [],
  targetPage: 0,
  targetFriendsListId: null,
  targetDiscordServerIds: [],
  startMode: DiscordCtpComposerStartMode.NOW,
  startAt: null,
  durationMinutes: 60,
  note: '',
  voiceMode: DiscordCtpComposerVoiceMode.NONE,
  voiceChannelId: null,
  voiceChannelName: null,
  sourceServerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 86400000)
}

const user = { id: 'creator', displayName: 'Creator', timezoneId: 'America/Edmonton', discordUserId: 'discord-creator' }

/** Find the draft's Post control without depending on its position in the row. */
function postControl(view: Awaited<ReturnType<typeof renderComposerView>>) {
  const control = view.components
    .flatMap((row) => row.components.map((component) => component.toJSON()))
    .find((component) => 'custom_id' in component && component.custom_id.endsWith(':post'))

  assert.ok(control)
  return control
}

test('an unselected server audience shows a visible blocker and disables Post', async () => {
  const view = await renderComposerView(draft, user)

  assert.match(view.content, /Choose at least one Discord server \(Audience\)/)
  assert.equal(postControl(view).disabled, true)
  assert.ok(view.components.flatMap((row) => row.components).some((component) => {
    const data = component.toJSON()
    return 'custom_id' in data && data.custom_id.endsWith(':goto:DETAILS') && !data.disabled
  }))
})

test('selecting a server clears the blocker and enables Post', async () => {
  const view = await renderComposerView({ ...draft, targetDiscordServerIds: ['server'] }, user)

  assert.equal(view.content, '')
  assert.equal(postControl(view).disabled, false)
})

test('a posting rejection remains visible above the embed', async () => {
  const notice = 'This call to play overlaps one of your other active calls.'

  const view = await renderComposerView({ ...draft, notifyScope: PlayIntentScope.FRIENDS_ONLY }, user, notice)

  assert.equal(view.content, notice)
  assert.equal(postControl(view).disabled, false)
})

test('an old enabled Post button returns the exact blocker without creating a call', async () => {
  const updates: Awaited<ReturnType<typeof renderComposerView>>[] = []
  const interaction = {
    customId: `guild-ctp:${draft.id}:post`,
    user: { id: user.discordUserId },
    deferred: true,
    replied: false,
    editReply: async (view: Awaited<ReturnType<typeof renderComposerView>>) => {
      updates.push(view)
    }
  } as unknown as ButtonInteraction

  // The client stub deliberately has no write methods. A stale Post control
  // must stop at validation instead of entering the play-intent save service.
  await handleCtpComposerButtonInteraction(interaction)

  assert.equal(updates.length, 1)
  assert.match(updates[0]!.content, /This call to play cannot be posted yet/)
  assert.match(updates[0]!.content, /Choose at least one Discord server \(Audience\)/)
  assert.equal(postControl(updates[0]!).disabled, true)
})
