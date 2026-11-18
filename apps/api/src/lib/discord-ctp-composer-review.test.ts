/** Regression coverage for visible posting blockers in the Discord composer. */
import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import {
  DiscordCtpComposerStartMode,
  DiscordCtpComposerStep,
  DiscordCtpComposerVoiceMode,
  PlayIntentScope,
  type DiscordCtpComposerDraft,
  type PrismaClient,
} from '@prisma/client'
import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js'

// Match the service-test convention: install a plain client stub before
// loading the composer so these checks cannot reach a database or Discord.
const prisma = {
  game: { findMany: async () => [{ title: 'Game' }] },
  userGameInterest: {
    findMany: async () => [{ gameId: 'game', game: { title: 'Game' } }],
  },
  discordServerMembership: { findMany: async () => [] },
  discordServer: { findMany: async () => [{ name: 'Selected server' }] },
  userIdentity: { findUnique: async () => ({ user }) },
  discordCtpComposerDraft: { findFirst: async () => draft },
}
globalThis.__gameIsUpPrisma__ = prisma as unknown as PrismaClient
const {
  renderComposerView,
  handleCtpComposerButtonInteraction,
  handleCtpComposerModalSubmit,
} = await import('./discord-ctp-composer.js')

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
  expiresAt: new Date(Date.now() + 86400000),
}

const user = {
  id: 'creator',
  displayName: 'Creator',
  timezoneId: 'America/Edmonton',
  discordUserId: 'discord-creator',
}

/** Find the draft's Post control without depending on its position in the row. */
function postControl(view: Awaited<ReturnType<typeof renderComposerView>>) {
  const control = view.components
    .flatMap((row) => row.components.map((component) => component.toJSON()))
    .find(
      (component) =>
        'custom_id' in component && component.custom_id.endsWith(':post'),
    )

  assert.ok(control)
  return control
}

test('an unselected server audience shows a visible blocker and disables Post', async () => {
  const view = await renderComposerView(draft, user)

  assert.match(
    view.embeds[0]!.data.description ?? '',
    /Choose at least one Discord server \(Audience\)/,
  )
  assert.equal(postControl(view).disabled, true)
  assert.ok(
    view.components
      .flatMap((row) => row.components)
      .some((component) => {
        const data = component.toJSON()
        return (
          'custom_id' in data &&
          data.custom_id.endsWith(':goto:DETAILS') &&
          !data.disabled
        )
      }),
  )
})

test('selecting a server clears the blocker and enables Post', async () => {
  const view = await renderComposerView(
    { ...draft, targetDiscordServerIds: ['server'] },
    user,
  )

  assert.equal(view.content, '')
  assert.equal(postControl(view).disabled, false)
})

test('a posting rejection remains visible above the embed', async () => {
  const notice = 'This call to play overlaps one of your other active calls.'

  const view = await renderComposerView(
    { ...draft, notifyScope: PlayIntentScope.FRIENDS_ONLY },
    user,
    { severity: 'error', message: notice },
  )

  assert.equal(view.embeds[0]!.data.description, notice)
  assert.equal(view.embeds[0]!.data.color, 0xef4444)
  assert.match(view.embeds[1]!.data.title ?? '', /Post a call/)
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
    },
  } as unknown as ButtonInteraction

  // The client stub deliberately has no write methods. A stale Post control
  // must stop at validation instead of entering the play-intent save service.
  await handleCtpComposerButtonInteraction(interaction)

  assert.equal(updates.length, 1)
  assert.match(
    updates[0]!.embeds[0]!.data.description ?? '',
    /This call to play cannot be posted yet/,
  )
  assert.match(
    updates[0]!.embeds[0]!.data.description ?? '',
    /Choose at least one Discord server \(Audience\)/,
  )
  assert.equal(postControl(updates[0]!).disabled, true)
})

test('title, note, and Friend invites share navigation rows below dropdowns', async () => {
  for (const step of [
    DiscordCtpComposerStep.BASICS,
    DiscordCtpComposerStep.DETAILS,
    DiscordCtpComposerStep.REVIEW,
  ]) {
    for (const hasText of [false, true]) {
      const view = await renderComposerView(
        {
          ...draft,
          step,
          title: hasText ? 'Title' : '',
          note: hasText ? 'Note' : '',
        },
        user,
      )
      const rows = view.components.map((row) => row.toJSON().components)
      const last = rows.at(-1)!
      const actions = last.map((control) =>
        'custom_id' in control ? control.custom_id : '',
      )
      const editAction =
        step === DiscordCtpComposerStep.BASICS
          ? 'title:edit'
          : step === DiscordCtpComposerStep.DETAILS
            ? 'note:edit'
            : 'participant-invites:toggle'
      assert.ok(actions.some((action) => action.endsWith(editAction)))
      assert.ok(actions.some((action) => action.endsWith('cancel')))
      assert.ok(
        actions.some(
          (action) => action.includes(':goto:') || action.endsWith(':post'),
        ),
      )
      assert.ok(rows.every((row) => row.length <= 5))
      assert.ok(
        rows
          .slice(0, -1)
          .every((row) =>
            row.every(
              (control) =>
                !('custom_id' in control) ||
                !control.custom_id.endsWith(editAction),
            ),
          ),
      )
    }
  }
})

test('informational composer notices are not red, and validation failures stay above the summary', async () => {
  const info = await renderComposerView(
    { ...draft, targetDiscordServerIds: ['server'] },
    user,
    { severity: 'info', message: 'Resumed your saved draft.' },
  )
  assert.notEqual(info.embeds[0]!.data.color, 0xef4444)
  const views: Awaited<ReturnType<typeof renderComposerView>>[] = []
  await handleCtpComposerModalSubmit({
    customId: `guild-ctp:${draft.id}:modal:duration`,
    user: { id: user.discordUserId },
    deferred: true,
    replied: false,
    isFromMessage: () => true,
    fields: { getTextInputValue: () => '1' },
    editReply: async (view: Awaited<ReturnType<typeof renderComposerView>>) => {
      views.push(view)
    },
  } as unknown as ModalSubmitInteraction)
  assert.equal(views[0]!.embeds[0]!.data.color, 0xef4444)
  assert.match(views[0]!.embeds[0]!.data.description ?? '', /between/)
  assert.match(views[0]!.embeds.at(-1)!.data.title ?? '', /Post a call to play/)
  assert.equal(postControl(views[0]!).disabled, true)
})

test('composer database failures resolve the original private message with a red error and restart controls', async () => {
  const log = mock.method(console, 'error', () => undefined)
  const lookup = mock.method(prisma.userIdentity, 'findUnique', async () => {
    throw new Error('Database unavailable')
  })
  const views: Awaited<ReturnType<typeof renderComposerView>>[] = []
  try {
    await handleCtpComposerButtonInteraction({
      customId: `guild-ctp:${draft.id}:goto:DETAILS`,
      user: { id: user.discordUserId },
      deferred: true,
      replied: false,
      editReply: async (
        view: Awaited<ReturnType<typeof renderComposerView>>,
      ) => {
        views.push(view)
      },
    } as unknown as ButtonInteraction)
    assert.equal(views.length, 1)
    assert.equal(views[0]!.embeds[0]!.data.color, 0xef4444)
    assert.match(JSON.stringify(views[0]!.components), /guild-ctp:open/)
  } finally {
    lookup.mock.restore()
    log.mock.restore()
  }
})
