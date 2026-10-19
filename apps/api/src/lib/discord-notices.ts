/** Consistent notice payloads for private composers and management panels. */
import { EmbedBuilder } from 'discord.js'

export type DiscordNotice = { severity: 'error' | 'success' | 'info'; message: string }

/** Put actionable errors in a red embed before the normal content, never in a plain-text banner. */
export function buildDiscordNoticeEmbeds(notice: DiscordNotice | null) {
  if (!notice) {
    return []
  }
  const color = { error: 0xef4444, success: 0x22c55e, info: 0x33d7a6 }[notice.severity]
  const title = { error: 'Needs attention', success: 'Saved', info: 'Notice' }[notice.severity]
  return [new EmbedBuilder().setColor(color).setTitle(title).setDescription(notice.message.slice(0, 4000))]
}
