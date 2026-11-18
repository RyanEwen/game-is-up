/**
 * Markdown primitives shared between live Discord DM payloads and the debug DM
 * simulator. Keep this file dependency-free so it can be imported from both
 * the API runtime and the web/shared simulator code.
 *
 * The decoration map is the single source of truth for emoji + label styling
 * applied to play-intent and auto-play-prompt fields across embed builders,
 * section headings, and debug DM previews. Add new labels here rather than
 * duplicating switch statements in feature-specific formatters.
 */

const fieldDecorations: Record<
  string,
  { emoji: string; displayLabel: string }
> = {
  creator: { emoji: '👤', displayLabel: 'Creator' },
  title: { emoji: '📝', displayLabel: 'Title' },
  game: { emoji: '🎮', displayLabel: 'Game' },
  games: { emoji: '🎯', displayLabel: 'Games' },
  duration: { emoji: '⏰', displayLabel: 'Duration' },
  timing: { emoji: '⏰', displayLabel: 'Timing' },
  when: { emoji: '⏰', displayLabel: 'Timing' },
  audience: { emoji: '👥', displayLabel: 'Audience' },
  window: { emoji: '🗓', displayLabel: 'Window' },
  'voice channel': { emoji: '🎙', displayLabel: 'Voice Channel' },
  interest: { emoji: '👥', displayLabel: 'Interest' },
  status: { emoji: '📡', displayLabel: 'Status' },
  note: { emoji: '🗒', displayLabel: 'Note' },
  'interested players': { emoji: '🙋', displayLabel: 'Interested Players' },
  'confirmed interested': { emoji: '🙋', displayLabel: 'Interested Players' },
  responses: { emoji: '🧾', displayLabel: 'Responses' },
  reach: { emoji: '📬', displayLabel: 'Reach' },
  'next step': { emoji: '🧭', displayLabel: 'Next Step' },
}

/**
 * Decorate a known field label with its canonical emoji prefix. Falls back to
 * the trimmed input when the label is not registered, so unknown values pass
 * through cleanly instead of silently disappearing.
 */
export function decorateFieldLabel(label: string): string {
  const trimmed = label.trim()
  const decoration = fieldDecorations[trimmed.toLowerCase()]
  return decoration ? `${decoration.emoji} ${decoration.displayLabel}` : trimmed
}

/**
 * Build a Discord-style `### Heading` line that uses the same decoration table
 * as `decorateFieldLabel`, so embed sections and notice headings stay aligned.
 */
export function buildDecoratedSectionHeading(label: string): string {
  return `### ${decorateFieldLabel(label)}`
}

/**
 * Canonical wording for an auto-play prompt that closed because the bot no
 * longer sees the recipient playing the observed game. Shared between live
 * cleanup and the debug simulator so the two never drift out of lock-step.
 */
export function buildAutoPlayInactiveObservationClosedReason(
  gameTitle: string,
): string {
  return `This prompt was closed because we are no longer seeing you in ${gameTitle}.`
}

/**
 * Wrap a single line of text in Discord's `-#` subtext marker. Returns an
 * empty string for blank input so callers can join arrays without filtering.
 */
export function buildDiscordSubtext(text: string): string {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return ''
  }

  return trimmed.startsWith('-# ') ? trimmed : `-# ${trimmed}`
}

/**
 * Compose a title-plus-sections-plus-subtext Discord notice payload. Null or
 * empty sections are dropped so callers can pass conditional content without
 * worrying about extra blank lines.
 */
export function buildDiscordNotice(
  title: string,
  sections: Array<string | null>,
  subtext?: string | null,
): string {
  return [
    title.trim(),
    ...sections,
    subtext ? buildDiscordSubtext(subtext) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
}
