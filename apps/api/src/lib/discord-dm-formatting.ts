import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder
} from 'discord.js'

type DiscordHeadingResolver = (label: string) => string

type FormatLabeledDiscordLinesOptions = {
  quotedLabels?: readonly string[];
  subtextLabels?: readonly string[];
}

function normalizeLabel(label: string) {
  return label.trim().toLowerCase()
}

function includesLabel(labels: readonly string[] | undefined, label: string) {
  return labels?.includes(normalizeLabel(label)) ?? false
}

export function buildDiscordSubtext(text: string) {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return ''
  }

  return trimmed.startsWith('-# ') ? trimmed : `-# ${trimmed}`
}

export function buildDiscordSection(
  label: string,
  value: string,
  resolveHeading: DiscordHeadingResolver,
  options: FormatLabeledDiscordLinesOptions = {}
) {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return ''
  }

  if (includesLabel(options.quotedLabels, label)) {
    return `> ${label.trim()}: ${trimmedValue}`
  }

  if (includesLabel(options.subtextLabels, label)) {
    return buildDiscordSubtext(trimmedValue)
  }

  return `${resolveHeading(label)}\n${trimmedValue}`
}

export function formatLabeledDiscordLines(
  text: string,
  resolveHeading: DiscordHeadingResolver,
  options: FormatLabeledDiscordLinesOptions = {}
) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const labeledMatch = /^([A-Za-z][A-Za-z ]{0,40}):\s+(.+)$/.exec(line)

      if (!labeledMatch) {
        return line
      }

      const label = labeledMatch[1]
      const value = labeledMatch[2]

      if (!label || !value) {
        return line
      }

      return buildDiscordSection(label, value, resolveHeading, options)
    })
}

export function buildDiscordBulletSection(label: string, items: string[], resolveHeading: DiscordHeadingResolver) {
  const visibleItems = items.map((item) => item.trim()).filter((item) => item.length > 0)

  if (visibleItems.length === 0) {
    return null
  }

  return `${resolveHeading(label)}\n${visibleItems.map((item) => `- ${item}`).join('\n')}`
}

export function buildDiscordNotice(title: string, sections: Array<string | null>, subtext?: string | null) {
  return [
    title.trim(),
    ...sections,
    subtext ? buildDiscordSubtext(subtext) : null
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildDiscordPlainMessage(
  title: string,
  bodyLines: Array<string | null | undefined>,
  options: {
    trailingSubtext?: string | null;
  } = {}
) {
  const visibleBodyLines = bodyLines
    .map((line) => line?.trim() ?? '')
    .filter((line) => line.length > 0)

  const formattedBodyLines = visibleBodyLines.map((line) => buildDiscordSubtext(line))

  return [
    title.trim(),
    ...formattedBodyLines,
    options.trailingSubtext ? buildDiscordSubtext(options.trailingSubtext) : null
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildDiscordMessageHeading(title: string) {
  const trimmed = title.trim()

  if (trimmed.length === 0) {
    return ''
  }

  return trimmed.replace(/^###\s+/u, '')
}

export function buildOpenInAppButton(url: string, label = 'Open App') {
  return new ButtonBuilder()
    .setLabel(label)
    .setStyle(ButtonStyle.Link)
    .setURL(url)
}

export function appendOpenInAppButton(
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  url: string,
  label = 'Open App'
) {
  const linkButton = buildOpenInAppButton(url, label)

  if (rows.length > 0) {
    const firstRowComponentCount = rows[0]?.toJSON().components?.length ?? 0

    if (firstRowComponentCount < 5) {
      rows[0]?.addComponents(linkButton)
      return rows
    }
  }

  return [
    ...rows,
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(linkButton)
  ]
}