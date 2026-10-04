/** Prompt acknowledgements, visible pending controls, duplicate protection, and recovery. */
import {
  buildPendingDiscordDmPreview,
  discordActionPendingCustomId,
  discordActionPendingLabel
} from '@game-is-up/shared'
import {
  ActionRowBuilder, ButtonStyle, ComponentType, MessageFlags,
  type ButtonInteraction, type StringSelectMenuInteraction, type ModalSubmitInteraction,
  type InteractionUpdateOptions, type MessageActionRowComponentBuilder
} from 'discord.js'
import { discordActionLocks, discordActionStates, type DiscordActionComponents } from './discord-action-state.js'
import { buildDebugDmPreview } from './discord-dm-preview.js'

type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction

/** Disable actions while preserving links, layout, and the original response choices. */
export function buildPendingDiscordComponents(rows: DiscordActionComponents, pressedCustomId: string): DiscordActionComponents {
  const actionComponents = rows.flatMap((row) => row.components).filter((component) => 'custom_id' in component)
  const selectedId = actionComponents.some((component) => component.custom_id === pressedCustomId)
    ? pressedCustomId
    : actionComponents.find((component) => !component.disabled)?.custom_id

  return rows.map((row) => ({
    ...row,
    components: row.components.map((component) => {
      if (component.type === ComponentType.Button && component.style === ButtonStyle.Link) {
        return component
      }

      if ('custom_id' in component && component.custom_id === selectedId && component.type === ComponentType.Button) {
        return { ...component, disabled: true, label: discordActionPendingLabel, custom_id: discordActionPendingCustomId }
      }

      if ('custom_id' in component && component.custom_id === selectedId) {
        return { ...component, disabled: true, custom_id: discordActionPendingCustomId, placeholder: discordActionPendingLabel }
      }

      return { ...component, disabled: true }
    })
  }))
}

/** Update the source message after either a fresh click or an early acknowledgement. */
export async function updateDiscordActionMessage(interaction: ComponentInteraction, payload: InteractionUpdateOptions) {
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(payload)
  } else if (!interaction.isModalSubmit() || interaction.isFromMessage()) {
    await interaction.update(payload)
  }
  const state = interaction.message ? discordActionStates.get(interaction.message.id) : undefined
  if (state && payload.components && !JSON.stringify(payload.components).includes(`"custom_id":"${discordActionPendingCustomId}"`)) {
    state.completed = true
  }
}

/** Existing deferred branches can safely run after the shared pending acknowledgement. */
export async function acknowledgeDiscordAction(interaction: ComponentInteraction) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferUpdate()
  }
}

/**
 * Acknowledge before database work and release the message lock in every outcome.
 * Modal-opening actions must keep the initial response available for showModal.
 * Public composer launch buttons reply privately and must not disable a shared post.
 */
export async function runDiscordMessageAction(
  interaction: ComponentInteraction,
  action: () => Promise<unknown>,
  options: { opensModal?: boolean; privateLaunch?: boolean; lockKey?: string | null } = {}
) {
  const message = interaction.message
  if (!message || options.privateLaunch || options.opensModal) {
    try {
      await action()
    } catch (error) {
      console.error('Discord form or composer launch failed', { customId: interaction.customId, error })
      const payload = { content: 'Unable to open that form right now. Please try again.', flags: MessageFlags.Ephemeral } as const
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => undefined)
      } else {
        await interaction.reply(payload).catch(() => undefined)
      }
    }
    return
  }

  const lockKey = options.lockKey ?? message.id
  if (discordActionLocks.has(lockKey) || discordActionStates.has(message.id)) {
    await interaction.reply({ content: 'This action is still being processed. Please wait.', flags: MessageFlags.Ephemeral })
    return
  }

  const components = message.components.map((row) => row.toJSON()) as DiscordActionComponents
  const rows = components.map((row) => ActionRowBuilder.from(row) as ActionRowBuilder<MessageActionRowComponentBuilder>)
  const preview = buildPendingDiscordDmPreview(buildDebugDmPreview(message.content, rows, message.embeds), interaction.customId)
  discordActionLocks.add(lockKey)
  discordActionStates.set(message.id, {
    pressedCustomId: interaction.customId,
    completed: false,
    restoreComponents: components,
    preview
  })

  try {
    await updateDiscordActionMessage(interaction, { components: buildPendingDiscordComponents(components, interaction.customId) })
    await action()
  } catch (error) {
    console.error('Discord message action failed', { customId: interaction.customId, error })
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Unable to finish that action right now. Check the current status before trying again.', flags: MessageFlags.Ephemeral }).catch(() => undefined)
    }
  } finally {
    try {
      const current = await interaction.fetchReply()
      const hasPendingButton = current.components.some((row) => row.type === ComponentType.ActionRow && row.components.some((component) => 'customId' in component && component.customId === discordActionPendingCustomId))
      // Preserve a completed result or deleted message. Restore only our own
      // waiting state, using the latest desired controls from tracked refreshes.
      if (hasPendingButton) {
        await interaction.editReply({ components: discordActionStates.get(message.id)?.restoreComponents ?? components })
      }
    } catch (error) {
      // A failed read must not strand waiting controls. Completed results and
      // deleted messages need no restoration; other failures get a direct retry.
      const unknownMessage = typeof error === 'object' && error !== null && 'code' in error && error.code === 10008
      const state = discordActionStates.get(message.id)
      if (!unknownMessage && state && !state.completed) {
        await interaction.editReply({ components: state.restoreComponents }).catch((restoreError) => {
          console.error('Unable to restore Discord message action controls', { messageId: message.id, restoreError })
        })
      }
    }
    discordActionStates.delete(message.id)
    discordActionLocks.delete(lockKey)
  }
}
