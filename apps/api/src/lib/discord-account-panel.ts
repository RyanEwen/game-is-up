/** Shared private-panel controls, actor-bound routing, and Discord payload limits. */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
  type ModalActionRowComponentBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js'
import { z } from 'zod'
import {
  buildDiscordNoticeEmbeds,
  type DiscordNotice,
} from './discord-notices.js'
import { env } from './env.js'

export type AccountPanelInteraction =
  ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction

export const accountHubPrefix = 'account-hub:'
export const panelPageSize = 25
export type PanelView = {
  content: string
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[]
  allowedMentions: { parse: [] }
}

/** Compact timestamp tokens leave room for actor and record ids within Discord's 100-character limit. */
export function panelRevision(updatedAt: Date | string) {
  return new Date(updatedAt).getTime().toString(36)
}

/** Missing, invalid, and oversized revisions require refreshing rather than an unconditional write. */
export function parsePanelRevision(value: string | undefined) {
  const token = z
    .string()
    .regex(/^[0-9a-z]{1,10}$/)
    .parse(value)
  const timestamp = Number.parseInt(token, 36)
  return z.date().parse(new Date(timestamp))
}

/** Every private control includes the Discord actor, independent of app account ids. */
export function panelId(
  actorId: string,
  action: string,
  ...args: (string | number)[]
) {
  const id = [accountHubPrefix + actorId, action, ...args].join(':')
  if (id.length > 100) {
    throw new Error('Private panel control is too long.')
  }
  return id
}

/** Public entry controls are the only controls without an owner. */
export function parsePanelId(customId: string, actorId: string) {
  if (!customId.startsWith(accountHubPrefix)) {
    return null
  }
  const [owner, action, ...args] = customId
    .slice(accountHubPrefix.length)
    .split(':')
  if (!action || (owner !== actorId && owner !== 'open')) {
    return null
  }
  if (
    owner === 'open' &&
    (!['join', 'games', 'friends'].includes(action) || args.length)
  ) {
    return null
  }
  return { owner, action, args }
}

export function panelButton(
  actor: string,
  action: string,
  label: string,
  args: (string | number)[] = [],
  style = ButtonStyle.Secondary,
) {
  return new ButtonBuilder()
    .setCustomId(panelId(actor, action, ...args))
    .setLabel(label)
    .setStyle(style)
}

export function panelRow(...buttons: ButtonBuilder[]) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...buttons,
  )
}

/** Build an App shortcut to the corresponding existing web view. */
export function panelAppButton(path: string) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel('App')
    .setURL(new URL(path, env.CLIENT_ORIGIN).toString())
}

export function panelView(
  title: string,
  description: string,
  components: PanelView['components'],
  notice: DiscordNotice | null = null,
): PanelView {
  return {
    content: '',
    embeds: [
      ...buildDiscordNoticeEmbeds(notice),
      new EmbedBuilder()
        .setColor(0x33d7a6)
        .setTitle(title)
        .setDescription(description.slice(0, 4000)),
    ],
    components,
    allowedMentions: { parse: [] },
  }
}

export function panelSelect(
  actor: string,
  action: string,
  placeholder: string,
  options: {
    label: string
    value: string
    description?: string
    default?: boolean
  }[],
  args: (string | number)[] = [],
  multiple = false,
) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(panelId(actor, action, ...args))
      .setPlaceholder(placeholder)
      .setMinValues(multiple ? 0 : 1)
      .setMaxValues(multiple ? options.length : 1)
      .addOptions(
        options.map((option) => ({
          ...option,
          label: option.label.slice(0, 100),
          description: option.description?.slice(0, 100),
        })),
      ),
  )
}

/** Clamp stale page cursors after removals and return at most Discord's 25 options. */
export function panelPage<T>(items: T[], requestedPage = 0) {
  const pageCount = Math.max(1, Math.ceil(items.length / panelPageSize))
  const page = Math.min(
    Math.max(0, Math.floor(Number.isFinite(requestedPage) ? requestedPage : 0)),
    pageCount - 1,
  )
  return {
    page,
    pageCount,
    items: items.slice(page * panelPageSize, (page + 1) * panelPageSize),
  }
}

export function panelPaging(
  actor: string,
  action: string,
  page: number,
  pageCount: number,
  tail: string[] = [],
) {
  if (pageCount < 2) {
    return []
  }
  return [
    panelRow(
      panelButton(actor, action, 'Previous', [
        Math.max(0, page - 1),
        ...tail,
      ]).setDisabled(page === 0),
      panelButton(actor, action, 'Next', [
        Math.min(pageCount - 1, page + 1),
        ...tail,
      ]).setDisabled(page === pageCount - 1),
    ),
  ]
}

/** Modal fields are short text so the same parser handles desktop and mobile inputs. */
export function panelModal(
  actor: string,
  action: string,
  title: string,
  fields: {
    id: string
    label: string
    value?: string
    required?: boolean
    max: number
    placeholder?: string
  }[],
  args: string[] = [],
) {
  const modal = new ModalBuilder()
    .setCustomId(panelId(actor, action, ...args))
    .setTitle(title)
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(field.required !== false)
      .setMaxLength(field.max)
    if (field.value) {
      input.setValue(field.value)
    }
    if (field.placeholder) {
      input.setPlaceholder(field.placeholder)
    }
    modal.addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        input,
      ),
    )
  }
  return modal
}
