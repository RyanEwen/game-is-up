/** Draft-scoped routing and shared posting policy for manual and detected-game composers. */
import { DiscordAutoPlayPromptStatus, type DiscordAutoPlayPrompt, type DiscordActivityObservation, type User, DiscordCtpComposerStartMode, DiscordCtpComposerVoiceMode, PlayIntentScope, type DiscordCtpComposerDraft } from '@prisma/client'
import type { PlayIntentNotifyScope, UpsertPlayIntentRequest } from '@game-is-up/shared'

const composerCustomIdPrefix = 'guild-ctp:'

export const scopeSlugByScope: Record<PlayIntentScope, PlayIntentNotifyScope> = {
  [PlayIntentScope.FRIENDS_ONLY]: 'friends-only',
  [PlayIntentScope.MUTUAL_FRIENDS]: 'network',
  [PlayIntentScope.SPECIFIC_FRIENDS]: 'specific-friends',
  [PlayIntentScope.SPECIFIC_FRIENDS_LIST]: 'friends-list',
  [PlayIntentScope.SPECIFIC_DISCORD_SERVER]: 'specific-discord-server'
}

export const scopeLabels: Record<PlayIntentScope, string> = {
  [PlayIntentScope.FRIENDS_ONLY]: 'Friends only',
  [PlayIntentScope.MUTUAL_FRIENDS]: 'Anyone in your network',
  [PlayIntentScope.SPECIFIC_FRIENDS]: 'Specific friends',
  [PlayIntentScope.SPECIFIC_FRIENDS_LIST]: 'Friends list',
  [PlayIntentScope.SPECIFIC_DISCORD_SERVER]: 'Specific Discord servers'
}

/** Draft routing accepts UUIDs only; legacy action names never become draft ids. */
function isDraftId(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
}

/** Decode both legacy manual controls and controls bound to a specific draft. */
export function composerAction(customId: string) {
  const parts = customId.slice(composerCustomIdPrefix.length).split(':')
  return isDraftId(parts[0]) ? parts.slice(1).join(':') : parts.join(':')
}

/** Return the draft identity for concurrency guards, or null for legacy controls. */
export function composerDraftId(customId: string) {
  const firstPart = customId.slice(composerCustomIdPrefix.length).split(':')[0]
  return isDraftId(firstPart) ? firstPart : null
}

/** Bind free-text submissions to the same draft as the launching button. */
export function composerModalId(draftId: string, field: string) {
  return `${composerCustomIdPrefix}${draftId}:modal:${field}`
}

/** Build the complete shared request; detected-game contexts force the source game and start now. */
export function buildComposerPlayIntentRequest(draft: Pick<DiscordCtpComposerDraft, 'gameIds' | 'notifyScope' | 'targetDiscordServerIds' | 'targetUserIds' | 'targetFriendsListId' | 'title' | 'note' | 'durationMinutes' | 'startMode' | 'startAt' | 'voiceMode' | 'voiceChannelId' | 'voiceChannelName'>, detectedGameId?: string): UpsertPlayIntentRequest {
  return {
    selectionMode: 'subset',
    notifyScope: scopeSlugByScope[draft.notifyScope],
    includeSelf: false,
    createDiscordSpace: draft.voiceMode === DiscordCtpComposerVoiceMode.TEMPORARY_SPACE,
    gameIds: detectedGameId ? [detectedGameId] : draft.gameIds,
    targetUserIds: draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS ? draft.targetUserIds : [],
    targetFriendsListId: draft.notifyScope === PlayIntentScope.SPECIFIC_FRIENDS_LIST ? draft.targetFriendsListId ?? undefined : undefined,
    targetDiscordServerIds: draft.notifyScope === PlayIntentScope.SPECIFIC_DISCORD_SERVER ? draft.targetDiscordServerIds : [],
    title: draft.title.trim().length > 0 ? draft.title.trim() : undefined,
    note: draft.note.trim(),
    startAt: !detectedGameId && draft.startMode === DiscordCtpComposerStartMode.SCHEDULED && draft.startAt ? draft.startAt.toISOString() : undefined,
    durationMinutes: draft.durationMinutes,
    voiceChannelId: draft.voiceMode === DiscordCtpComposerVoiceMode.EXISTING_CHANNEL ? draft.voiceChannelId ?? undefined : undefined,
    voiceChannelName: draft.voiceMode === DiscordCtpComposerVoiceMode.EXISTING_CHANNEL ? draft.voiceChannelName ?? undefined : undefined
  }
}

/** Recheck source ownership, opt-in, and active detection before resuming or posting. */
export function isAutoPlayComposerPromptAvailable(
  prompt: (Pick<DiscordAutoPlayPrompt, 'userId' | 'status'> & {
    observation: Pick<DiscordActivityObservation, 'isActive'>;
    user: Pick<User, 'discordAutoPromptPlayIntent'>;
  }) | null,
  userId: string
) {
  return Boolean(prompt && prompt.userId === userId
    && prompt.status === DiscordAutoPlayPromptStatus.SENT
    && prompt.observation.isActive
    && prompt.user.discordAutoPromptPlayIntent)
}
