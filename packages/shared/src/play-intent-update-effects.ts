/**
 * Pure helpers that classify play-intent edits.
 *
 * The API uses these to decide which audience-side responses must be reset
 * (substantive timing or game-list changes) versus which edits are quiet
 * (note-only, audience-only, or temporary-Discord-channel-only). Keeping the
 * comparison logic in shared lets the web composer preview the same outcome
 * without round-tripping the server.
 */

export const playIntentUpdatedFieldLabels = [
  'time',
  'game selection',
  'note',
  'audience',
  'temporary Discord channel'
] as const

export type PlayIntentUpdatedField = (typeof playIntentUpdatedFieldLabels)[number]

export type PlayIntentUpdateComparison = {
  timeKey?: string | null;
  gameSelectionKey?: readonly string[] | null;
  note?: string | null;
  audienceKey?: readonly string[] | null;
  hasTemporaryDiscordChannel?: boolean | null;
}

const invalidatingAudienceResponseUpdatedFields = new Set<PlayIntentUpdatedField>([
  'time',
  'game selection'
])

function normalizePlayIntentUpdateValue(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function normalizePlayIntentUpdateKey(values: readonly string[] | null | undefined) {
  return [...new Set((values ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0))]
    .sort()
}

function areSamePlayIntentUpdateKeys(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined
) {
  const normalizedLeft = normalizePlayIntentUpdateKey(left)
  const normalizedRight = normalizePlayIntentUpdateKey(right)

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

/**
 * Diff two play-intent snapshots and return the human-readable field labels
 * that changed. Order is stable across calls so the labels can be rendered
 * directly into notification copy.
 */
export function resolvePlayIntentUpdatedFields(
  previous: PlayIntentUpdateComparison,
  next: PlayIntentUpdateComparison
) {
  const updatedFields: PlayIntentUpdatedField[] = []

  if (normalizePlayIntentUpdateValue(previous.timeKey) !== normalizePlayIntentUpdateValue(next.timeKey)) {
    updatedFields.push('time')
  }

  if (!areSamePlayIntentUpdateKeys(previous.gameSelectionKey, next.gameSelectionKey)) {
    updatedFields.push('game selection')
  }

  if (normalizePlayIntentUpdateValue(previous.note) !== normalizePlayIntentUpdateValue(next.note)) {
    updatedFields.push('note')
  }

  if (!areSamePlayIntentUpdateKeys(previous.audienceKey, next.audienceKey)) {
    updatedFields.push('audience')
  }

  if (Boolean(previous.hasTemporaryDiscordChannel) !== Boolean(next.hasTemporaryDiscordChannel)) {
    updatedFields.push('temporary Discord channel')
  }

  return updatedFields
}

/**
 * Build the one-line summary used in audience- and creator-facing update
 * notifications. Empty input falls back to a generic phrase so the surface
 * never renders an empty change list.
 */
export function buildPlayIntentUpdatedFieldsSummary(updatedFields: readonly string[]) {
  return updatedFields.length > 0
    ? `Updated the call to play: ${updatedFields.join(', ')} changed.`
    : 'Updated the call to play details.'
}

/**
 * True when at least one updated field is substantive enough that previously
 * collected audience responses (interested / pass) should be invalidated.
 * Quiet edits (note, audience-only, temporary Discord channel) preserve the
 * existing responses.
 */
export function shouldInvalidatePlayIntentAudienceResponse(updatedFields: readonly string[]) {
  return updatedFields.some((field) => invalidatingAudienceResponseUpdatedFields.has(field as PlayIntentUpdatedField))
}