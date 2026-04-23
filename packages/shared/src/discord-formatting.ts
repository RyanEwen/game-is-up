// Markdown primitives that are safe to use in either Discord DM payloads or
// the debug DM simulator. Keep this file dependency-free so it can be imported
// from both the API runtime and the web/shared simulator code.

// Single source of truth for emoji + label decoration applied to play-intent
// and auto-play-prompt fields across embed builders, section headings, and
// debug DM previews. Add new labels here rather than duplicating switch
// statements in feature-specific formatters.
const fieldDecorations: Record<string, { emoji: string; displayLabel: string }> = {
  'creator': { emoji: '👤', displayLabel: 'Creator' },
  'title': { emoji: '📝', displayLabel: 'Title' },
  'game': { emoji: '🎮', displayLabel: 'Game' },
  'games': { emoji: '🎯', displayLabel: 'Games' },
  'duration': { emoji: '⏰', displayLabel: 'Duration' },
  'timing': { emoji: '⏰', displayLabel: 'Timing' },
  'when': { emoji: '⏰', displayLabel: 'Timing' },
  'audience': { emoji: '👥', displayLabel: 'Audience' },
  'window': { emoji: '🗓', displayLabel: 'Window' },
  'voice channel': { emoji: '🎙', displayLabel: 'Voice Channel' },
  'interest': { emoji: '👥', displayLabel: 'Interest' },
  'status': { emoji: '📡', displayLabel: 'Status' },
  'note': { emoji: '🗒', displayLabel: 'Note' },
  'interested players': { emoji: '🙋', displayLabel: 'Interested Players' },
  'confirmed interested': { emoji: '🙋', displayLabel: 'Interested Players' },
  'responses': { emoji: '🧾', displayLabel: 'Responses' },
  'reach': { emoji: '📬', displayLabel: 'Reach' },
  'next step': { emoji: '🧭', displayLabel: 'Next Step' }
}

export function decorateFieldLabel(label: string): string {
  const trimmed = label.trim()
  const decoration = fieldDecorations[trimmed.toLowerCase()]
  return decoration ? `${decoration.emoji} ${decoration.displayLabel}` : trimmed
}

export function buildDecoratedSectionHeading(label: string): string {
  return `### ${decorateFieldLabel(label)}`
}

// Shared copy used both by the live auto-play prompt cleanup flow and the
// debug simulator preview so the two stay in lock-step when wording changes.
export function buildAutoPlayInactiveObservationClosedReason(gameTitle: string): string {
  return `This prompt was closed because we are no longer seeing you in ${gameTitle}.`
}

export function buildDiscordSubtext(text: string): string {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return ''
  }

  return trimmed.startsWith('-# ') ? trimmed : `-# ${trimmed}`
}

export function buildDiscordNotice(
  title: string,
  sections: Array<string | null>,
  subtext?: string | null
): string {
  return [
    title.trim(),
    ...sections,
    subtext ? buildDiscordSubtext(subtext) : null
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
}
