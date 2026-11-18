/** Builds the Discord form for an optional delay estimate without owning response persistence. */
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

export const runningLateModalPrefix = 'play-intent-late'
export const runningLateMinutesFieldId = 'minutes'

/** Opens an estimate form for the recipient's own notification; blank means unknown. */
export function buildRunningLateModal(
  notificationId: string,
  minutes?: number | null,
) {
  const input = new TextInputBuilder()
    .setCustomId(runningLateMinutesFieldId)
    .setLabel('How many minutes late?')
    .setPlaceholder('For example, 15. Leave blank if unsure.')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(4)

  if (minutes != null) {
    input.setValue(String(minutes))
  }

  return new ModalBuilder()
    .setCustomId(`${runningLateModalPrefix}:${notificationId}`)
    .setTitle("I'll be late")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    )
}
