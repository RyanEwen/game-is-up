/** Shared waiting-state copy and preview transformation for Discord message actions. */
import type { DebugDmPreview } from './index.js'

export const discordActionPendingLabel = 'Working...'
export const discordActionPendingCustomId = 'discord-action-pending'

/** Keep navigation links available while all message actions are disabled. */
export function buildPendingDiscordDmPreview(
  preview: DebugDmPreview,
  pressedCustomId: string,
): DebugDmPreview {
  const buttons = preview.buttonRows
    .flat()
    .filter((button) => button.style !== 'link')
  const selectedId =
    buttons.some((button) => button.customId === pressedCustomId) ||
    preview.selectMenus?.some((menu) => menu.customId === pressedCustomId)
      ? pressedCustomId
      : buttons.find((button) => !button.disabled)?.customId

  return {
    ...preview,
    pending: true,
    selectMenus: preview.selectMenus?.map((menu) => ({
      ...menu,
      disabled: true,
      placeholder:
        menu.customId === selectedId
          ? discordActionPendingLabel
          : menu.placeholder,
    })),
    buttonRows: preview.buttonRows.map((row) =>
      row.map((button) => {
        if (button.style === 'link') {
          return button
        }

        return {
          ...button,
          disabled: true,
          label:
            button.customId === selectedId
              ? discordActionPendingLabel
              : button.label,
        }
      }),
    ),
  }
}
