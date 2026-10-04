/** Process-local message action locks and live previews; the gateway has one owner. */
import type { DebugDmPreview } from '@game-is-up/shared'
import type { APIActionRowComponent, APIComponentInMessageActionRow } from 'discord.js'

export type DiscordActionComponents = APIActionRowComponent<APIComponentInMessageActionRow>[]
export type DiscordActionState = {
  pressedCustomId: string;
  completed: boolean;
  restoreComponents: DiscordActionComponents;
  preview: DebugDmPreview | null;
}

export const discordActionLocks = new Set<string>()
export const discordActionStates = new Map<string, DiscordActionState>()

/** Read the actual transient preview instead of reconstructing a steady database state. */
export function getPendingDiscordActionPreview(messageId?: string | null) {
  return messageId ? discordActionStates.get(messageId)?.preview ?? null : null
}
