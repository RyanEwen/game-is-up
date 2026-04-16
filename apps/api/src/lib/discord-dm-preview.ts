import type { DebugDmPreview } from '@game-is-up/shared'
import { ButtonStyle, type ActionRowBuilder, type MessageActionRowComponentBuilder } from 'discord.js'

function toDebugButtonStyle(style: number | undefined): DebugDmPreview['buttonRows'][number][number]['style'] {
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
  components: ReadonlyArray<ActionRowBuilder<MessageActionRowComponentBuilder>>
): DebugDmPreview {
  return {
    content,
    buttonRows: components
      .map((row) => {
        const serializedRow = row.toJSON() as {
          components?: Array<{
            type?: number;
            style?: number;
            label?: string;
            disabled?: boolean;
            url?: string;
            custom_id?: string;
          }>;
        }

        return (serializedRow.components ?? [])
          .filter((component) => component.type === 2 && Boolean(component.label))
          .map((component) => ({
            label: component.label ?? 'Action',
            style: toDebugButtonStyle(component.style),
            disabled: Boolean(component.disabled),
            url: component.url ?? null,
            customId: component.custom_id ?? null
          }))
      })
      .filter((row) => row.length > 0)
  }
}