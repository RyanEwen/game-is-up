import type { MessageCreateOptions } from 'discord.js'

import {
  editDiscordDirectMessage,
  sendDiscordDirectMessages,
  type DiscordDirectMessagePayload,
} from './discord-bot-runtime.js'

export type TrackedDiscordDirectMessage = {
  channelId?: string | null
  messageId?: string | null
}

export type SyncTrackedDiscordDirectMessageOptions = {
  tracked?: TrackedDiscordDirectMessage
  discordUserId: string
  content: string
  embeds?: MessageCreateOptions['embeds']
  components?: MessageCreateOptions['components']
  replyTo?: DiscordDirectMessagePayload['replyTo']
  onMissingTrackedMessage?: () => Promise<void>
  onSent?: (result: { channelId: string; messageId: string }) => Promise<void>
}

export function isMissingDiscordMessageError(error: string | null | undefined) {
  return /Unknown Message/i.test(error ?? '')
}

export async function syncTrackedDiscordDirectMessage(
  options: SyncTrackedDiscordDirectMessageOptions,
) {
  const trackedChannelId = options.tracked?.channelId ?? null
  const trackedMessageId = options.tracked?.messageId ?? null

  if (trackedChannelId && trackedMessageId) {
    const editResult = await editDiscordDirectMessage({
      channelId: trackedChannelId,
      messageId: trackedMessageId,
      content: options.content,
      embeds: options.embeds,
      components: options.components,
    })

    if (editResult.status === 'edited') {
      return {
        status: 'edited' as const,
        channelId: trackedChannelId,
        messageId: trackedMessageId,
        error: null,
      }
    }

    if (!isMissingDiscordMessageError(editResult.error)) {
      return {
        status: 'failed' as const,
        channelId: trackedChannelId,
        messageId: trackedMessageId,
        error: editResult.error,
      }
    }

    await options.onMissingTrackedMessage?.()
  }

  const dmResult = (
    await sendDiscordDirectMessages([
      {
        discordUserId: options.discordUserId,
        content: options.content,
        embeds: options.embeds,
        components: options.components,
        replyTo: options.replyTo,
      },
    ])
  )[0]

  if (!dmResult || dmResult.status !== 'sent') {
    return {
      status: 'failed' as const,
      channelId: dmResult?.channelId ?? null,
      messageId: dmResult?.messageId ?? null,
      error: dmResult?.error ?? 'Discord did not return a DM send result.',
    }
  }

  if (dmResult.emulated || !dmResult.channelId || !dmResult.messageId) {
    return {
      status: 'emulated' as const,
      channelId: dmResult.channelId,
      messageId: dmResult.messageId,
      error: null,
    }
  }

  await options.onSent?.({
    channelId: dmResult.channelId,
    messageId: dmResult.messageId,
  })

  return {
    status: 'sent' as const,
    channelId: dmResult.channelId,
    messageId: dmResult.messageId,
    error: null,
  }
}
