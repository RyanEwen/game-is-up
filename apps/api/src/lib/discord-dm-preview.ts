/** Serializes Discord payloads and exposes transient message-action states to admins. */
import { getPendingDiscordActionPreview } from './discord-action-state.js'
import type { DebugDmPreview } from '@game-is-up/shared'
import {
  ButtonStyle,
  ComponentType,
  type APIEmbed,
  type ActionRowBuilder,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
} from 'discord.js'
import { formatDiscordDirectMessageContent } from './discord-dm-formatting.js'

function toDebugButtonStyle(
  style: number | undefined,
): DebugDmPreview['buttonRows'][number][number]['style'] {
  switch (style) {
    case ButtonStyle.Primary:
      return 'primary'
    case ButtonStyle.Danger:
      return 'danger'
    case ButtonStyle.Link:
      return 'link'
    default:
      return 'secondary'
  }
}

export function buildDebugDmPreview(
  content: string,
  components: ReadonlyArray<ActionRowBuilder<MessageActionRowComponentBuilder>>,
  embeds: MessageCreateOptions['embeds'] = [],
  messageId?: string | null,
): DebugDmPreview {
  const pending = getPendingDiscordActionPreview(messageId)
  if (pending) {
    return pending
  }

  return {
    content: formatDiscordDirectMessageContent(content, embeds),
    embeds: (embeds ?? []).map((embed) => {
      const serializedEmbed = (
        typeof embed === 'object' &&
        embed != null &&
        'toJSON' in embed &&
        typeof embed.toJSON === 'function'
          ? embed.toJSON()
          : embed
      ) as APIEmbed

      return {
        title:
          typeof serializedEmbed?.title === 'string'
            ? serializedEmbed.title
            : null,
        description:
          typeof serializedEmbed?.description === 'string'
            ? serializedEmbed.description
            : null,
        color:
          typeof serializedEmbed?.color === 'number'
            ? serializedEmbed.color
            : null,
        fields: Array.isArray(serializedEmbed?.fields)
          ? serializedEmbed.fields.flatMap(
              (field: NonNullable<APIEmbed['fields']>[number]) => {
                if (
                  !field ||
                  typeof field.name !== 'string' ||
                  typeof field.value !== 'string'
                ) {
                  return []
                }

                return [
                  {
                    name: field.name,
                    value: field.value,
                    inline: Boolean(field.inline),
                  },
                ]
              },
            )
          : [],
        footerText:
          serializedEmbed?.footer &&
          typeof serializedEmbed.footer === 'object' &&
          typeof serializedEmbed.footer.text === 'string'
            ? serializedEmbed.footer.text
            : null,
        imageUrl:
          serializedEmbed?.image &&
          typeof serializedEmbed.image === 'object' &&
          typeof serializedEmbed.image.url === 'string'
            ? serializedEmbed.image.url
            : null,
        thumbnailUrl:
          serializedEmbed?.thumbnail &&
          typeof serializedEmbed.thumbnail === 'object' &&
          typeof serializedEmbed.thumbnail.url === 'string'
            ? serializedEmbed.thumbnail.url
            : null,
      }
    }),
    selectMenus: components.flatMap((row) =>
      row.toJSON().components.flatMap((component) => {
        if (component.type !== ComponentType.StringSelect) {
          return []
        }
        return [
          {
            customId: component.custom_id,
            placeholder: component.placeholder ?? 'Choose an option',
            disabled: Boolean(component.disabled),
            minValues: component.min_values ?? 1,
            maxValues: component.max_values ?? 1,
            options: component.options.map((option) => ({
              label: option.label,
              value: option.value,
              description: option.description ?? null,
              selected: Boolean(option.default),
            })),
          },
        ]
      }),
    ),
    buttonRows: components
      .map((row) => {
        const serializedRow = row.toJSON() as {
          components?: Array<{
            type?: number
            style?: number
            label?: string
            disabled?: boolean
            url?: string
            custom_id?: string
          }>
        }

        return (serializedRow.components ?? [])
          .filter(
            (component) => component.type === 2 && Boolean(component.label),
          )
          .map((component) => ({
            label: component.label ?? 'Action',
            style: toDebugButtonStyle(component.style),
            disabled: Boolean(component.disabled),
            url: component.url ?? null,
            customId: component.custom_id ?? null,
          }))
      })
      .filter((row) => row.length > 0),
  }
}
