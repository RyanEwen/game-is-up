/** Automatic prompt entry into the full composer, with independent saved drafts and live debug previews. */
import { DiscordCtpComposerStartMode, PlayIntentScope } from '@prisma/client'
import { MessageFlags, type ButtonInteraction } from 'discord.js'
import {
  resolveLinkedComposerUser,
  loadDraftForUser,
  renderComposerView,
} from './discord-ctp-composer.js'
import {
  composerDraftId,
  isAutoPlayComposerPromptAvailable,
} from './discord-ctp-composer-policy.js'
import { buildDebugDmPreview } from './discord-dm-preview.js'
import { discordActionStates } from './discord-action-state.js'
import { prisma } from './prisma.js'

/** Open the full manual composer with only the detected game and start fixed. */
export async function launchAutoPlayCtpComposer(
  interaction: ButtonInteraction,
  promptId: string,
  defaults: {
    durationMinutes?: number
    notifyScope?: 'friends-only' | 'network'
  } = {},
) {
  const user = await resolveLinkedComposerUser(interaction.user.id)
  const prompt = await prisma.discordAutoPlayPrompt.findUnique({
    where: { id: promptId },
    include: {
      observation: true,
      user: { select: { discordAutoPromptPlayIntent: true } },
    },
  })
  if (!user || !prompt || !isAutoPlayComposerPromptAvailable(prompt, user.id)) {
    await interaction.followUp({
      content:
        'This automatic prompt is no longer available. Start a manual call to play instead.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const contextKey = `auto:${prompt.id}`
  const existingDraft = await loadDraftForUser(user.id, contextKey)
  const draft =
    existingDraft ??
    (await prisma.discordCtpComposerDraft.upsert({
      where: { userId_contextKey: { userId: user.id, contextKey } },
      update: {},
      create: {
        userId: user.id,
        discordUserId: interaction.user.id,
        contextKey,
        autoPlayPromptId: prompt.id,
        gameIds: [prompt.gameId],
        startMode: DiscordCtpComposerStartMode.NOW,
        durationMinutes: defaults.durationMinutes ?? 60,
        notifyScope:
          defaults.notifyScope === 'network'
            ? PlayIntentScope.MUTUAL_FRIENDS
            : PlayIntentScope.FRIENDS_ONLY,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    }))
  await interaction.followUp({
    ...(await renderComposerView(
      draft,
      user,
      existingDraft
        ? { severity: 'info', message: 'Resumed your detected-game draft.' }
        : null,
    )),
    flags: MessageFlags.Ephemeral,
  })
}

/** Serialize the saved automatic composer for the admin's read-only DM inspection. */
export async function getAutoPlayComposerDebugPreview(promptId: string) {
  const draft = await prisma.discordCtpComposerDraft.findUnique({
    where: { autoPlayPromptId: promptId },
    include: {
      user: { select: { id: true, displayName: true, timezoneId: true } },
    },
  })
  if (!draft || draft.expiresAt.getTime() <= Date.now()) {
    return null
  }
  const pending = [...discordActionStates.values()].find(
    (state) => composerDraftId(state.pressedCustomId) === draft.id,
  )?.preview
  if (pending) {
    return pending
  }
  const view = await renderComposerView(draft, draft.user)
  return buildDebugDmPreview(view.content, view.components, view.embeds)
}
