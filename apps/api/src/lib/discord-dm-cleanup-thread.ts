import type { DiscordChannelMessageSummary } from './discord-bot-runtime.js'

export function collectReplyMessageIdsForCleanup(options: {
  messages: DiscordChannelMessageSummary[];
  botUserId: string | null;
  referencedMessageIds: Iterable<string>;
  preservedMessageIds?: Iterable<string>;
}) {
  if (!options.botUserId) {
    return []
  }

  const referencedMessageIds = new Set([...options.referencedMessageIds].filter(Boolean))

  if (referencedMessageIds.size === 0) {
    return []
  }

  const preservedMessageIds = new Set([...(options.preservedMessageIds ?? [])].filter(Boolean))
  const replyMessageIds: string[] = []
  const seenMessageIds = new Set<string>()

  for (const message of options.messages) {
    if (
      message.authorId !== options.botUserId
      || !message.referencedMessageId
      || !referencedMessageIds.has(message.referencedMessageId)
      || preservedMessageIds.has(message.id)
      || seenMessageIds.has(message.id)
    ) {
      continue
    }

    seenMessageIds.add(message.id)
    replyMessageIds.push(message.id)
  }

  return replyMessageIds
}