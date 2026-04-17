import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions
} from 'discord.js'
import {
  AuthProvider,
  NotificationResponseChoice,
  NotificationType
} from '@prisma/client'
import { archivePlayIntentDirectMessages } from './discord-dm-cleanup.js'
import {
  deleteDiscordDirectMessage,
  editDiscordDirectMessage,
  sendDiscordDirectMessages,
  supportsDiscordInteractiveMessages
} from './discord-bot-runtime.js'
import {
  appendOpenInAppButton,
  buildDiscordBulletSection,
  buildDiscordNotice,
  buildDiscordSection,
  buildDiscordSubtext,
  buildOpenInAppButton,
  formatLabeledDiscordLines
} from './discord-dm-formatting.js'
import { env } from './env.js'
import { prisma } from './prisma.js'
import { normalizeTimezoneId } from './timezone-label.js'

const playIntentNotificationPrefix = 'play-intent-response'
const playIntentMutePrefix = 'play-intent-mute'
const scheduledPlayIntentCheckInPrefix = 'scheduled-play-intent-check-in'
const creatorPlayIntentSummaryPrefix = 'creator-play-intent-summary'

type PlayIntentNotificationAction = {
  notificationId: string;
  response: PlayIntentRecipientResponse;
}

type PlayIntentMuteAction = {
  creatorUserId: string;
}

type ScheduledPlayIntentCheckInAction = {
  notificationId: string;
  response: NotificationResponseChoice;
}

type CreatorPlayIntentSummaryAction = {
  playIntentId: string;
  action: 'cancel';
}

type PlayIntentRecipientResponse = 'JOIN' | 'DECLINE'

type DirectMessagePreviewPayload = {
  content: string;
  embeds?: MessageCreateOptions['embeds'];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

type ResolvablePlayIntentNotification = {
  id: string;
  userId: string;
  gameId: string | null;
  responseChoice: NotificationResponseChoice | null;
  user: {
    displayName: string;
  };
  game: {
    title: string;
  } | null;
  playIntent: {
    id: string;
    user: {
      id: string;
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  } | null;
}

type CreatorPlayIntentSummarySnapshot = {
  id: string;
  headline: string;
  note: string;
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  scope: 'FRIENDS_ONLY' | 'MUTUAL_FRIENDS' | 'SPECIFIC_FRIENDS' | 'SPECIFIC_DISCORD_SERVER';
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  voiceChannelName: string | null;
  creatorDiscordDmChannelId: string | null;
  creatorDiscordDmMessageId: string | null;
  user: {
    id: string;
    displayName: string;
    timezoneId: string;
    identities: { providerUserId: string }[];
  };
  targetDiscordServers: {
    server: {
      name: string;
    };
  }[];
  targetFriends: {
    friendUser: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
  games: {
    game: {
      title: string;
    };
  }[];
  notifications: {
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
    user?: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
}

type ExpirePendingPlayIntentNotificationsOptions = {
  notifyAudienceOnEnd?: boolean;
}

export class PlayIntentNotificationResponseError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
    this.name = 'PlayIntentNotificationResponseError'
  }
}

function buildPlayUrl(): string {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function buildDiscordUserMention(discordUserId: string | null | undefined) {
  return discordUserId ? `<@${discordUserId}>` : null
}

function buildDiscordUserLabel(displayName: string, discordUserId: string | null | undefined) {
  return buildDiscordUserMention(discordUserId) ?? displayName
}

function replaceDisplayNameWithMention(text: string, displayName: string, discordUserId: string | null | undefined) {
  if (!discordUserId || !displayName.trim()) {
    return text
  }

  return text.split(displayName).join(buildDiscordUserLabel(displayName, discordUserId))
}

function buildLinkRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildOpenInAppButton(buildPlayUrl())
  )
}

function buildCreatorSummaryActionRow(playIntentId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:cancel`)
      .setLabel('Cancel call to play')
      .setStyle(ButtonStyle.Danger)
  )
}

function buildResponseRow(notificationId: string, responseChoice?: NotificationResponseChoice | null) {
  const buttons: MessageActionRowComponentBuilder[] = []

  if (responseChoice !== NotificationResponseChoice.JOIN) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:join`)
        .setLabel('I\'m interested')
        .setStyle(ButtonStyle.Primary)
    )
  }

  if (responseChoice !== NotificationResponseChoice.DECLINE) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:pass`)
        .setLabel('Pass')
        .setStyle(ButtonStyle.Secondary)
    )
  }

  if (buttons.length === 0) {
    return null
  }

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)
}

function buildMuteLabel(creatorDisplayName: string) {
  const normalized = creatorDisplayName.trim()
  const baseLabel = normalized ? `Mute ${normalized}` : 'Mute creator'

  // Discord button labels are limited to 80 characters.
  if (baseLabel.length <= 80) {
    return baseLabel
  }

  return `${baseLabel.slice(0, 77)}...`
}

function buildMuteRow(creatorUserId: string, creatorDisplayName: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${playIntentMutePrefix}:${creatorUserId}`)
      .setLabel(buildMuteLabel(creatorDisplayName))
      .setStyle(ButtonStyle.Danger)
  )
}

function buildScheduledCheckInResponseRow(notificationId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${scheduledPlayIntentCheckInPrefix}:${notificationId}:confirm`)
      .setLabel('Still on')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${scheduledPlayIntentCheckInPrefix}:${notificationId}:cancel`)
      .setLabel('Not happening')
      .setStyle(ButtonStyle.Secondary)
  )
}

function buildDirectMessageSectionHeading(label: string) {
  switch (label.trim().toLowerCase()) {
    case 'creator':
      return '### 👤 Creator'
    case 'title':
      return '### 📝 Title'
    case 'games':
      return '### 🎯 Games'
    case 'when':
      return '### ⏰ When'
    case 'audience':
      return '### 👥 Audience'
    case 'window':
      return '### 🗓 Window'
    case 'voice channel':
      return '### 🎙 Voice Channel'
    case 'interest':
      return '### 👥 Interest'
    case 'status':
      return '### 📡 Status'
    case 'note':
      return '### 🗒 Note'
    case 'confirmed interested':
      return '### 🙋 Interested Players'
    case 'reach':
      return '### 📬 Reach'
    default:
      return `### ${label.trim()}`
  }
}

const directMessageLineFormatting = {
  quotedLabels: ['update'],
  subtextLabels: ['reply']
}

function formatDirectMessageField(label: string, value: string) {
  return buildDiscordSection(label, value, buildDirectMessageSectionHeading, directMessageLineFormatting)
}

function formatLabeledDirectMessageLines(text: string) {
  return formatLabeledDiscordLines(text, buildDirectMessageSectionHeading, directMessageLineFormatting)
}

function buildDirectMessageBulletSection(label: string, items: string[]) {
  return buildDiscordBulletSection(label, items, buildDirectMessageSectionHeading)
}

function buildDirectMessageNotice(title: string, sections: Array<string | null>, subtext?: string | null) {
  return buildDiscordNotice(title, sections, subtext)
}

const dmEmbedColors = {
  info: 0x3b82f6,
  warning: 0xf59e0b,
  success: 0x22c55e,
  danger: 0xef4444,
  neutral: 0x64748b
} as const

type DiscordEmbedFieldInput = {
  name: string;
  value: string | null | undefined;
  inline?: boolean;
}

function sanitizeDiscordEmbedValue(value: string) {
  return value.trim().slice(0, 1024)
}

function buildDiscordEmbedFields(fields: DiscordEmbedFieldInput[]) {
  return fields.flatMap((field) => {
    const trimmedValue = field.value?.trim()

    if (!trimmedValue) {
      return []
    }

    return [{
      name: field.name,
      value: sanitizeDiscordEmbedValue(trimmedValue),
      inline: field.inline ?? false
    }]
  })
}

function extractLabeledFields(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const labeledMatch = /^([A-Za-z][A-Za-z ]{0,40}):\s+(.+)$/.exec(line)

      if (!labeledMatch || !labeledMatch[1] || !labeledMatch[2]) {
        return []
      }

      return [{
        label: labeledMatch[1].trim(),
        value: labeledMatch[2].trim()
      }]
    })
}

export function buildPlayIntentDirectMessageEmbeds(
  title: string,
  body: string,
  creatorDiscordUserId?: string | null,
  creatorDisplayName?: string | null,
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  joinCount?: number,
  interestedUserLabels?: string[]
) {
  const titleWithCreatorMention = creatorDisplayName
    ? replaceDisplayNameWithMention(title, creatorDisplayName, creatorDiscordUserId)
    : title
  const replacedBody = creatorDisplayName
    ? replaceDisplayNameWithMention(body, creatorDisplayName, creatorDiscordUserId)
    : body
  const voiceChannelValue = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `<#${voiceChannel.channelId}>`
      : voiceChannel.channelName
    : null
  const fieldsFromBody = extractLabeledFields(replacedBody)
  const updateField = fieldsFromBody.find((field) => field.label.trim().toLowerCase() === 'update')
  const detailFields = fieldsFromBody.filter((field) => field.label.trim().toLowerCase() !== 'update')
  const interestedSummary = interestedUserLabels && interestedUserLabels.length > 0
    ? `Confirmed: ${formatInterestedUserLabelSummary(interestedUserLabels)}`
    : null
  const embed = new EmbedBuilder()
    .setColor(dmEmbedColors.info)
    .setTitle(titleWithCreatorMention)
    .addFields(buildDiscordEmbedFields([
      ...detailFields.map((field) => ({
        name: field.label,
        value: field.value,
        inline: field.label.trim().toLowerCase() !== 'games'
      })),
      {
        name: 'Voice Channel',
        value: voiceChannelValue,
        inline: true
      },
      {
        name: 'Interest',
        value: [
          joinCount && joinCount > 0
            ? `${joinCount} ${joinCount === 1 ? 'person is' : 'people are'} showing interest.`
            : null,
          interestedSummary
        ].filter((part): part is string => Boolean(part)).join('\n'),
        inline: false
      }
    ]))
    .setFooter({ text: 'Respond from the buttons below or open the app.' })

  if (updateField?.value) {
    embed.setDescription(updateField.value)
  }

  return [
    embed
  ]
}

function buildScheduledCheckInEmbeds(creatorLabel: string) {
  return [
    new EmbedBuilder()
      .setColor(dmEmbedColors.warning)
      .setTitle('Go-Time Check-In')
      .setDescription(`Your scheduled call to play is starting now, ${creatorLabel}.`)
      .addFields(buildDiscordEmbedFields([
        {
          name: 'Status',
          value: 'Confirm that you are still on, or close the call if plans changed.',
          inline: false
        }
      ]))
      .setFooter({ text: 'Use the buttons below for the fastest response.' })
  ]
}

function buildArchivedPlayIntentEmbeds(body: string) {
  return [
    new EmbedBuilder()
      .setColor(dmEmbedColors.danger)
      .setTitle('Call to Play Ended')
      .addFields(buildDiscordEmbedFields(
        extractLabeledFields(body).map((field) => ({
          name: field.label,
          value: field.value,
          inline: field.label.trim().toLowerCase() !== 'games'
        }))
      ))
      .setFooter({ text: 'This call to play is no longer active.' })
  ]
}

export function buildPlayIntentDirectMessage(
  title: string,
  body: string,
  creatorDiscordUserId?: string | null,
  creatorDisplayName?: string | null,
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null,
  joinCount?: number,
  interestedUserLabels?: string[],
  includeInterestPrompt = true
) {
  const titleWithCreatorMention = creatorDisplayName
    ? replaceDisplayNameWithMention(title, creatorDisplayName, creatorDiscordUserId)
    : title
  const replacedBody = creatorDisplayName
    ? replaceDisplayNameWithMention(body, creatorDisplayName, creatorDiscordUserId)
    : body

  const voiceChannelValue = voiceChannel?.channelName
    ? voiceChannel.channelId && voiceChannel.recipientSharesServer
      ? `<#${voiceChannel.channelId}>`
      : voiceChannel.channelName
    : null

  const interestSection = buildDirectMessageBulletSection('Interest', [
    joinCount && joinCount > 0
      ? `${joinCount} ${joinCount === 1 ? 'person is' : 'people are'} showing interest.`
      : '',
    interestedUserLabels && interestedUserLabels.length > 0
      ? `Confirmed: ${formatInterestedUserLabelSummary(interestedUserLabels)}`
      : ''
  ])

  const responseSubtext = includeInterestPrompt
    ? supportsDiscordInteractiveMessages()
      ? buildDiscordSubtext('Use the buttons below to answer.')
      : buildDiscordSubtext('Open the app to say whether you\'re interested.')
    : null

  const postedByQuote = creatorDiscordUserId
    && !titleWithCreatorMention.includes(`<@${creatorDiscordUserId}>`)
    && !replacedBody.includes(`<@${creatorDiscordUserId}>`)
    ? `> Posted by <@${creatorDiscordUserId}>`
    : null

  return [
    `## 🎮 ${titleWithCreatorMention}`,
    postedByQuote,
    ...formatLabeledDirectMessageLines(replacedBody),
    ...(voiceChannelValue ? [formatDirectMessageField('Voice channel', voiceChannelValue)] : []),
    interestSection,
    responseSubtext
  ].filter((part): part is string => Boolean(part)).join('\n\n')
}

export function buildPlayIntentNotificationComponents(
  notificationId: string,
  creatorUserId?: string,
  creatorDisplayName?: string,
  responseChoice?: NotificationResponseChoice | null
) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  const responseRow = buildResponseRow(notificationId, responseChoice)

  if (responseRow) {
    rows.push(responseRow)
  }

  if (responseChoice === NotificationResponseChoice.DECLINE && creatorUserId && creatorDisplayName) {
    rows.push(buildMuteRow(creatorUserId, creatorDisplayName))
  }

  if (!supportsDiscordInteractiveMessages()) {
    return [buildLinkRow()]
  }

  return appendOpenInAppButton(rows, buildPlayUrl())
}

export function buildScheduledPlayIntentCheckInComponents(notificationId: string) {
  return supportsDiscordInteractiveMessages()
    ? appendOpenInAppButton([buildScheduledCheckInResponseRow(notificationId)], buildPlayUrl())
    : [buildLinkRow()]
}

export function buildNotificationDirectMessagePreview(options: {
  notificationId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  responseChoice?: NotificationResponseChoice | null;
  creatorUserId?: string | null;
  creatorDiscordUserId?: string | null;
  creatorDisplayName?: string | null;
  gameTitle?: string | null;
  playIntentIsActive?: boolean;
  voiceChannel?: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  joinCount?: number;
  interestedUserLabels?: string[];
}): DirectMessagePreviewPayload {
  const creatorLabel = options.creatorDisplayName
    ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
    : 'this player'

  if (options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN) {
    if (options.responseChoice === NotificationResponseChoice.CANCELED) {
      return {
        content: buildCreatorCanceledMessage(),
        components: [buildLinkRow()]
      }
    }

    if (options.responseChoice === NotificationResponseChoice.CONFIRMED) {
      return {
        content: buildCreatorConfirmedMessage(),
        components: [buildLinkRow()]
      }
    }

    if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
      return {
        content: buildExpiredMessage('This call to play expired before you confirmed.'),
        components: [buildLinkRow()]
      }
    }

      const creatorMention = options.creatorDisplayName
        ? buildDiscordUserLabel(options.creatorDisplayName, options.creatorDiscordUserId)
        : 'there'

    return {
      content: '',
        embeds: buildScheduledCheckInEmbeds(creatorMention),
      components: buildScheduledPlayIntentCheckInComponents(options.notificationId)
    }
  }

  if (
    options.notificationType === NotificationType.FRIEND_PLAYING
    || options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
    || options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
  ) {
    if (options.responseChoice === NotificationResponseChoice.JOIN) {
      return {
        content: buildJoinAcceptedMessage(creatorLabel),
        components: buildPlayIntentNotificationComponents(
          options.notificationId,
          options.creatorUserId ?? undefined,
          options.creatorDisplayName ?? undefined,
          options.responseChoice
        )
      }
    }

    if (options.responseChoice === NotificationResponseChoice.DECLINE) {
      return {
        content: buildPassAcceptedMessage(),
        components: buildPlayIntentNotificationComponents(
          options.notificationId,
          options.creatorUserId ?? undefined,
          options.creatorDisplayName ?? undefined,
          options.responseChoice
        )
      }
    }

    if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
      return {
        content: buildExpiredMessage(buildSessionEndedReason(creatorLabel, options.gameTitle ?? null)),
        components: [buildLinkRow()]
      }
    }

    return {
      content: '',
      embeds: buildPlayIntentDirectMessageEmbeds(
        options.title,
        options.body,
        options.creatorDiscordUserId,
        options.creatorDisplayName,
        options.voiceChannel,
        options.joinCount,
        options.interestedUserLabels
      ),
      components: buildPlayIntentNotificationComponents(
        options.notificationId,
        options.creatorUserId ?? undefined,
        options.creatorDisplayName ?? undefined,
        options.responseChoice
      )
    }
  }

  if (options.notificationType === NotificationType.SYSTEM && options.title === 'Call to play ended') {
    return {
      content: '',
      embeds: buildArchivedPlayIntentEmbeds(options.body),
      components: []
    }
  }

  return {
    content: [`**${options.title}**`, options.body].filter(Boolean).join('\n\n'),
    components: [buildLinkRow()]
  }
}

function buildCreatorPlayIntentSummaryComponents(playIntentId: string, isActive: boolean) {
  if (!isActive || !supportsDiscordInteractiveMessages()) {
    return [buildLinkRow()]
  }

  return appendOpenInAppButton([buildCreatorSummaryActionRow(playIntentId)], buildPlayUrl())
}

function formatSummaryDateTime(date: Date, timezoneId: string) {
  const normalizedTimezoneId = normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimezoneId,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}

function summarizeCreatorAudience(snapshot: CreatorPlayIntentSummarySnapshot) {
  if (snapshot.scope === 'SPECIFIC_DISCORD_SERVER' && snapshot.targetDiscordServers.length > 0) {
    const names = snapshot.targetDiscordServers
      .map((entry) => entry.server.name)
      .sort((left, right) => left.localeCompare(right))

    if (names.length <= 4) {
      return `Audience: Discord servers ${names.join(', ')}`
    }

    return `Audience: Discord servers ${names.slice(0, 4).join(', ')} +${names.length - 4} more`
  }

  if (snapshot.scope === 'SPECIFIC_FRIENDS') {
    const names = snapshot.targetFriends
      .map((entry) => buildDiscordUserLabel(entry.friendUser.displayName, entry.friendUser.identities?.[0]?.providerUserId))
      .sort((left, right) => left.localeCompare(right))

    if (names.length <= 4) {
      return `Audience: Specific friends (${names.join(', ')})`
    }

    return `Audience: Specific friends (${names.slice(0, 4).join(', ')} +${names.length - 4} more)`
  }

  if (snapshot.scope === 'MUTUAL_FRIENDS') {
    return 'Audience: Friends and your selected network'
  }

  return 'Audience: Friends only'
}

function summarizeCreatorGames(snapshot: CreatorPlayIntentSummarySnapshot) {
  if (snapshot.selectionMode === 'ENTIRE_LIBRARY') {
    return 'Games: Your library'
  }

  const titles = snapshot.games.map((entry) => entry.game.title).sort((left, right) => left.localeCompare(right))

  if (titles.length <= 4) {
    return `Games: ${titles.join(', ')}`
  }

  return `Games: ${titles.slice(0, 4).join(', ')} +${titles.length - 4} more`
}

function formatInterestedUserLabelSummary(labels: string[]) {
  const sortedLabels = [...labels].sort((left, right) => left.localeCompare(right))

  if (sortedLabels.length <= 5) {
    return sortedLabels.join(', ')
  }

  return `${sortedLabels.slice(0, 5).join(', ')} +${sortedLabels.length - 5} more`
}

function getCreatorSummaryRecipientStats(snapshot: CreatorPlayIntentSummarySnapshot) {
  const relevantNotifications = snapshot.notifications.filter((notification) =>
    notification.type === NotificationType.FRIEND_PLAYING
    || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
    || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
  )

  const latestByUserId = new Map<string, {
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    interestedUserLabel: string;
  }>()
  const deliveredUserIds = new Set<string>()

  for (const notification of relevantNotifications) {
    if (notification.deliveredAt) {
      deliveredUserIds.add(notification.userId)
    }

    if (!latestByUserId.has(notification.userId)) {
      latestByUserId.set(notification.userId, {
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice,
        interestedUserLabel: notification.user
          ? buildDiscordUserLabel(notification.user.displayName, notification.user.identities?.[0]?.providerUserId)
          : notification.userId
      })
    }
  }

  let interestedCount = 0
  let passedCount = 0
  let waitingCount = 0
  const interestedUserLabels: string[] = []

  for (const status of latestByUserId.values()) {
    if (status.responseChoice === NotificationResponseChoice.JOIN) {
      interestedCount += 1
      interestedUserLabels.push(status.interestedUserLabel)
      continue
    }

    if (status.responseChoice === NotificationResponseChoice.DECLINE) {
      passedCount += 1
      continue
    }

    if (!status.respondedAt) {
      waitingCount += 1
    }
  }

  return {
    matchedCount: latestByUserId.size,
    deliveredCount: deliveredUserIds.size,
    interestedCount,
    interestedUserLabels,
    passedCount,
    waitingCount
  }
}

function getCreatorSummaryStatus(snapshot: CreatorPlayIntentSummarySnapshot, currentTime = new Date()) {
  const latestCheckIn = snapshot.notifications.find((notification) => notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN)

  if (snapshot.expiresAt <= currentTime) {
    return 'Status: Closed'
  }

  if (latestCheckIn?.responseChoice === NotificationResponseChoice.CANCELED) {
    return 'Status: Closed'
  }

  if (latestCheckIn && !latestCheckIn.respondedAt && snapshot.windowStartsAt <= currentTime) {
    return 'Status: Starting now - waiting for your confirmation'
  }

  if (snapshot.windowStartsAt.getTime() > currentTime.getTime() + 60 * 1000) {
    return 'Status: Scheduled'
  }

  return 'Status: Live now'
}

function buildCreatorPlayIntentSummaryEmbeds(
  snapshot: CreatorPlayIntentSummarySnapshot,
  currentTime = new Date()
) {
  const stats = getCreatorSummaryRecipientStats(snapshot)
  const startsAtLabel = formatSummaryDateTime(snapshot.windowStartsAt, snapshot.user.timezoneId)
  const endsAtLabel = formatSummaryDateTime(snapshot.windowEndsAt, snapshot.user.timezoneId)
  const statusLabel = getCreatorSummaryStatus(snapshot, currentTime).replace(/^Status:\s*/, '')
  const statusColor = statusLabel === 'Closed'
    ? dmEmbedColors.danger
    : statusLabel === 'Scheduled'
      ? dmEmbedColors.info
      : statusLabel === 'Live now'
        ? dmEmbedColors.success
        : dmEmbedColors.warning

  return [
    new EmbedBuilder()
      .setColor(statusColor)
      .setTitle(`Your Call to Play for ${startsAtLabel}`)
      .setDescription(snapshot.headline)
      .addFields(buildDiscordEmbedFields([
        {
          name: 'Status',
          value: statusLabel,
          inline: true
        },
        {
          name: 'Window',
          value: `${startsAtLabel} to ${endsAtLabel}`,
          inline: true
        },
        {
          name: 'Games',
          value: summarizeCreatorGames(snapshot).replace(/^Games:\s*/, ''),
          inline: false
        },
        {
          name: 'Audience',
          value: summarizeCreatorAudience(snapshot).replace(/^Audience:\s*/, ''),
          inline: false
        },
        {
          name: 'Voice Channel',
          value: snapshot.voiceChannelName,
          inline: true
        },
        {
          name: 'Interested Players',
          value: stats.interestedUserLabels.length > 0
            ? formatInterestedUserLabelSummary(stats.interestedUserLabels)
            : 'No one yet.',
          inline: false
        },
        {
          name: 'Responses',
          value: `Interested: ${stats.interestedCount}\nPassed: ${stats.passedCount}\nWaiting: ${stats.waitingCount}`,
          inline: true
        },
        {
          name: 'Reach',
          value: stats.matchedCount > 0
            ? `${stats.deliveredCount} of ${stats.matchedCount} matched players received a Discord DM.`
            : 'No matching players were found yet.',
          inline: true
        },
        {
          name: 'Note',
          value: snapshot.note,
          inline: false
        }
      ]))
      .setFooter({
        text: snapshot.expiresAt > currentTime
          ? 'Use the buttons below to open the app or cancel this call to play.'
          : 'Open the app below if you want to post another call to play.'
      })
  ]
}

export function buildCreatorPlayIntentSummaryPreview(snapshot: {
  id: string;
  headline: string;
  note: string;
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  scope: 'FRIENDS_ONLY' | 'MUTUAL_FRIENDS' | 'SPECIFIC_FRIENDS' | 'SPECIFIC_DISCORD_SERVER';
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  voiceChannelName: string | null;
  user: {
    displayName: string;
    timezoneId: string;
  };
  targetDiscordServers: {
    server: {
      name: string;
    };
  }[];
  targetFriends: {
    friendUser: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
  games: {
    game: {
      title: string;
    };
  }[];
  notifications: {
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
    user?: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
  }[];
  currentTime?: Date;
}): DirectMessagePreviewPayload {
  const currentTime = snapshot.currentTime ?? new Date()

  return {
    content: '',
    embeds: buildCreatorPlayIntentSummaryEmbeds(snapshot as CreatorPlayIntentSummarySnapshot, currentTime),
    components: buildCreatorPlayIntentSummaryComponents(snapshot.id, snapshot.expiresAt > currentTime)
  }
}

async function getCreatorPlayIntentSummarySnapshot(playIntentId: string) {
  return prisma.playIntent.findUnique({
    where: {
      id: playIntentId
    },
    select: {
      id: true,
      headline: true,
      note: true,
      selectionMode: true,
      scope: true,
      windowStartsAt: true,
      windowEndsAt: true,
      expiresAt: true,
      voiceChannelName: true,
      creatorDiscordDmChannelId: true,
      creatorDiscordDmMessageId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          timezoneId: true,
          identities: {
            where: {
              provider: AuthProvider.DISCORD
            },
            select: {
              providerUserId: true
            }
          }
        }
      },
      targetDiscordServers: {
        select: {
          server: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
      targetFriends: {
        select: {
          friendUser: {
            select: {
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      },
      games: {
        select: {
          game: {
            select: {
              title: true
            }
          }
        }
      },
      notifications: {
        where: {
          type: {
            in: [
              NotificationType.FRIEND_PLAYING,
              NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
              NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
            ]
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          userId: true,
          type: true,
          respondedAt: true,
          responseChoice: true,
          deliveredAt: true,
          createdAt: true,
          user: {
            select: {
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    }
  })
}

async function sendOrEditCreatorPlayIntentSummary(playIntentId: string) {
  const snapshot = await getCreatorPlayIntentSummarySnapshot(playIntentId)

  if (!snapshot) {
    return
  }

  const creatorDiscordUserId = snapshot.user.identities[0]?.providerUserId

  if (!creatorDiscordUserId) {
    return
  }

  const isActive = snapshot.expiresAt > new Date()
  const content = ''
  const embeds = buildCreatorPlayIntentSummaryEmbeds(snapshot)
  const components = buildCreatorPlayIntentSummaryComponents(playIntentId, isActive)

  // Active summary changes should trigger a fresh Discord notification.
  // Closed/archive states are allowed to fall back to quiet edit-in-place updates.
  if (isActive) {
    const dmResult = (await sendDiscordDirectMessages([
      {
        discordUserId: creatorDiscordUserId,
        content,
        embeds,
        components
      }
    ]))[0]

    if (dmResult?.status === 'sent') {
      if (dmResult.emulated) {
        return
      }

      if (!dmResult.channelId || !dmResult.messageId) {
        return
      }

      if (snapshot.creatorDiscordDmChannelId && snapshot.creatorDiscordDmMessageId) {
        await deleteDiscordDirectMessage({
          channelId: snapshot.creatorDiscordDmChannelId,
          messageId: snapshot.creatorDiscordDmMessageId
        })
      }

      await prisma.playIntent.update({
        where: {
          id: playIntentId
        },
        data: {
          creatorDiscordDmChannelId: dmResult.channelId,
          creatorDiscordDmMessageId: dmResult.messageId
        }
      })
      return
    }
  }

  if (snapshot.creatorDiscordDmChannelId && snapshot.creatorDiscordDmMessageId) {
    const editResult = await editDiscordDirectMessage({
      channelId: snapshot.creatorDiscordDmChannelId,
      messageId: snapshot.creatorDiscordDmMessageId,
      content,
      embeds,
      components
    })

    if (editResult.status === 'edited') {
      return
    }
  }

  const dmResult = (await sendDiscordDirectMessages([
    {
      discordUserId: creatorDiscordUserId,
      content,
      embeds,
      components
    }
  ]))[0]

  if (dmResult?.status !== 'sent') {
    return
  }

  if (dmResult.emulated) {
    return
  }

  await prisma.playIntent.update({
    where: {
      id: playIntentId
    },
    data: {
      creatorDiscordDmChannelId: dmResult.channelId,
      creatorDiscordDmMessageId: dmResult.messageId
    }
  })
}

export async function syncCreatorPlayIntentSummaryMessages(playIntentIds: string[]) {
  const uniquePlayIntentIds = [...new Set(playIntentIds.filter(Boolean))]

  for (const playIntentId of uniquePlayIntentIds) {
    await sendOrEditCreatorPlayIntentSummary(playIntentId)
  }
}

function buildExpiredMessage(reason: string) {
  return buildDirectMessageNotice(
    '⌛ Call to Play Closed',
    [
      '> This call-to-play prompt is no longer available.',
      `> ${reason}`
    ],
    'Open the app if you still want to coordinate or post your own call to play.'
  )
}

function buildJoinAcceptedMessage(creatorLabel: string) {
  return buildDirectMessageNotice(
    '✅ You Are Marked Interested',
    [
      formatDirectMessageField('Status', `I marked you as interested in ${creatorLabel}'s call to play.`),
      '> They have been notified.'
    ]
  )
}

function buildPassAcceptedMessage() {
  return buildDirectMessageNotice(
    '👍 Passed for Now',
    [
      formatDirectMessageField('Status', 'You are marked as passing for now (passing is anonymous).')
    ],
    'You can still switch to "I\'m interested" later.'
  )
}

function buildSessionEndedReason(creatorLabel: string, gameTitle: string | null) {
  return gameTitle
    ? `${creatorLabel}'s ${gameTitle} session ended before you answered.`
    : `${creatorLabel}'s call to play ended before you answered.`
}

function buildCreatorConfirmedMessage() {
  return buildDirectMessageNotice(
    '✅ Call Confirmed',
    [
      buildDirectMessageBulletSection('Status', [
        'I let everyone know your call to play is still on.',
        'I reminded anyone who had not answered yet.'
      ])
    ]
  )
}

function buildCreatorCanceledMessage() {
  return buildDirectMessageNotice(
    '🛑 Call Closed',
    [
      buildDirectMessageBulletSection('Status', [
        'I closed this call to play.',
        'I let your audience know it was closed.'
      ])
    ],
    'You can post a fresh call to play whenever you are ready.'
  )
}

function buildCreatorCheckInAlreadyHandledMessage(responseChoice: NotificationResponseChoice | null) {
  if (responseChoice === NotificationResponseChoice.CONFIRMED) {
    return buildDirectMessageNotice(
      'ℹ️ Already Handled',
      ['> You already confirmed that this call to play is still on.']
    )
  }

  if (responseChoice === NotificationResponseChoice.CANCELED) {
    return buildDirectMessageNotice(
      'ℹ️ Already Handled',
      ['> You already marked this call to play as not happening.']
    )
  }

  return buildDirectMessageNotice(
    'ℹ️ Already Handled',
    ['> This check-in was already handled earlier.']
  )
}

function buildGoTimeConfirmedCopy(creatorDisplayName: string) {
  return {
    title: `${creatorDisplayName} confirmed the session is on`,
    body: `Update: ${creatorDisplayName} confirmed the session is still on.\nWhen: Right now.`
  }
}

function buildGoTimeReminderCopy(creatorDisplayName: string) {
  return {
    title: `${creatorDisplayName} confirmed the session is on`,
    body: `Update: ${creatorDisplayName} confirmed this session is still on.\nWhen: Right now.`
  }
}

function buildAnonymousPassResultMessage(message: string) {
  return buildDirectMessageNotice(
    '👍 Passed for Now',
    [
      formatDirectMessageField('Status', message)
    ],
    'Passing is anonymous.'
  )
}

function parseAction(customId: string): PlayIntentNotificationAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== playIntentNotificationPrefix || !parts[1]) {
    return null
  }

  if (parts[2] === 'join') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.JOIN
    }
  }

  if (parts[2] === 'decline') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.DECLINE
    }
  }

  if (parts[2] === 'pass') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.DECLINE
    }
  }

  return null
}

function parseMuteAction(customId: string): PlayIntentMuteAction | null {
  const parts = customId.split(':')

  if (parts.length !== 2 || parts[0] !== playIntentMutePrefix || !parts[1]) {
    return null
  }

  return {
    creatorUserId: parts[1]
  }
}

function parseScheduledCheckInAction(customId: string): ScheduledPlayIntentCheckInAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== scheduledPlayIntentCheckInPrefix || !parts[1]) {
    return null
  }

  if (parts[2] === 'confirm') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.CONFIRMED
    }
  }

  if (parts[2] === 'cancel') {
    return {
      notificationId: parts[1],
      response: NotificationResponseChoice.CANCELED
    }
  }

  return null
}

function parseCreatorPlayIntentSummaryAction(customId: string): CreatorPlayIntentSummaryAction | null {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== creatorPlayIntentSummaryPrefix || !parts[1]) {
    return null
  }

  if (parts[2] !== 'cancel') {
    return null
  }

  return {
    playIntentId: parts[1],
    action: 'cancel'
  }
}

function buildCreatorJoinNotification(notification: {
  recipientDisplayName: string;
  gameTitle: string | null;
}) {
  const title = notification.gameTitle
    ? `${notification.recipientDisplayName} is interested in ${notification.gameTitle}`
    : `${notification.recipientDisplayName} is interested in your call to play`
  const body = notification.gameTitle
    ? `${notification.recipientDisplayName} marked themselves as interested in your ${notification.gameTitle} call to play.`
    : `${notification.recipientDisplayName} marked themselves as interested in your call to play.`

  return {
    title,
    body
  }
}

async function applyRecipientResponseToPlayIntentNotification(options: {
  notification: ResolvablePlayIntentNotification;
  response: PlayIntentRecipientResponse;
}) {
  const { notification, response } = options

  if (!notification.playIntent) {
    throw new PlayIntentNotificationResponseError(409, 'The original call to play is no longer active.')
  }

  const playIntent = notification.playIntent
  const previousChoice = notification.responseChoice
  const creatorDiscordUserId = playIntent.user.identities?.[0]?.providerUserId ?? null
  const creatorDiscordLabel = buildDiscordUserLabel(playIntent.user.displayName, creatorDiscordUserId)

  if (response === NotificationResponseChoice.DECLINE) {
    await prisma.notification.update({
      where: {
        id: notification.id
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.DECLINE
      }
    })

    await syncCreatorPlayIntentSummaryMessages([playIntent.id])

    return {
      content: previousChoice === NotificationResponseChoice.JOIN
        ? buildAnonymousPassResultMessage(`Understood. I marked you as passing on ${playIntent.user.displayName}'s call to play.`)
        : previousChoice === NotificationResponseChoice.DECLINE
          ? buildAnonymousPassResultMessage('You are still marked as passed on this call to play.')
          : buildPassAcceptedMessage(),
      discordContent: previousChoice === NotificationResponseChoice.JOIN
        ? buildAnonymousPassResultMessage(`Understood. I marked you as passing on ${creatorDiscordLabel}'s call to play.`)
        : previousChoice === NotificationResponseChoice.DECLINE
          ? buildAnonymousPassResultMessage('You are still marked as passed on this call to play.')
          : buildPassAcceptedMessage()
    }
  }

  const creatorNotificationCopy = buildCreatorJoinNotification({
    recipientDisplayName: notification.user.displayName,
    gameTitle: notification.game?.title ?? null
  })

  const joinResult = previousChoice !== NotificationResponseChoice.JOIN
    ? await prisma.$transaction(async (transaction) => {
        await transaction.notification.update({
          where: {
            id: notification.id
          },
          data: {
            respondedAt: new Date(),
            responseChoice: NotificationResponseChoice.JOIN
          }
        })

        return transaction.notification.create({
          data: {
            userId: playIntent.user.id,
            triggeredByUserId: notification.userId,
            playIntentId: playIntent.id,
            gameId: notification.gameId,
            type: NotificationType.SYSTEM,
            title: creatorNotificationCopy.title,
            body: creatorNotificationCopy.body
          },
          select: {
            id: true,
            title: true,
            body: true
          }
        })
      })
    : await prisma.notification.update({
        where: {
          id: notification.id
        },
        data: {
          respondedAt: new Date(),
          responseChoice: NotificationResponseChoice.JOIN
        },
        select: {
          id: true,
          title: true,
          body: true
        }
      })

  if (previousChoice !== NotificationResponseChoice.JOIN) {
      if (creatorDiscordUserId) {
        const dmResult = (await sendDiscordDirectMessages([
          {
            discordUserId: creatorDiscordUserId,
            content: [`**${joinResult.title}**`, joinResult.body].join('\n\n'),
            components: [buildLinkRow()]
          }
        ]))[0]

        if (dmResult?.status === 'sent' && !dmResult.emulated) {
          await prisma.notification.update({
            where: {
              id: joinResult.id
            },
            data: {
              deliveredAt: new Date(),
              discordDmChannelId: dmResult.channelId,
              discordDmMessageId: dmResult.messageId
            }
          })
        }
      }
  }

  await syncCreatorPlayIntentSummaryMessages([playIntent.id])

  return {
    content: previousChoice === NotificationResponseChoice.DECLINE
      ? `Nice. I marked you as interested in ${playIntent.user.displayName}'s call to play and let them know.`
      : previousChoice === NotificationResponseChoice.JOIN
        ? 'You are still marked as interested in this call to play.'
        : buildJoinAcceptedMessage(playIntent.user.displayName),
    discordContent: previousChoice === NotificationResponseChoice.DECLINE
      ? `Nice. I marked you as interested in ${creatorDiscordLabel}'s call to play and let them know.`
      : previousChoice === NotificationResponseChoice.JOIN
        ? 'You are still marked as interested in this call to play.'
        : buildJoinAcceptedMessage(creatorDiscordLabel)
  }
}

export async function respondToPlayIntentFromWeb(options: {
  userId: string;
  playIntentId: string;
  response: PlayIntentRecipientResponse;
}) {
  const notification = await prisma.notification.findFirst({
    where: {
      userId: options.userId,
      playIntentId: options.playIntentId,
      type: {
        in: [
          NotificationType.FRIEND_PLAYING,
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ]
      }
    },
    select: {
      id: true,
      userId: true,
      gameId: true,
      responseChoice: true,
      user: {
        select: {
          displayName: true
        }
      },
      game: {
        select: {
          title: true
        }
      },
      playIntent: {
        select: {
          id: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  if (!notification) {
    throw new PlayIntentNotificationResponseError(404, 'No active response prompt was found for this call to play.')
  }

  if (!notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    throw new PlayIntentNotificationResponseError(409, 'The original call to play is no longer active.')
  }

  const result = await applyRecipientResponseToPlayIntentNotification({
    notification,
    response: options.response
  })

  return {
    responseChoice: options.response === NotificationResponseChoice.JOIN ? 'join' : 'decline',
    message: result.content
  }
}

export function isPlayIntentNotificationCustomId(customId: string) {
  return customId.startsWith(`${playIntentNotificationPrefix}:`) || customId.startsWith(`${playIntentMutePrefix}:`)
}

export function isPlayIntentMuteCustomId(customId: string) {
  return customId.startsWith(`${playIntentMutePrefix}:`)
}

export function isScheduledPlayIntentCheckInCustomId(customId: string) {
  return customId.startsWith(`${scheduledPlayIntentCheckInPrefix}:`)
}

export function isCreatorPlayIntentSummaryCustomId(customId: string) {
  return customId.startsWith(`${creatorPlayIntentSummaryPrefix}:`)
}

export async function sweepScheduledPlayIntentCreatorCheckIns() {
  const now = new Date()

  const candidateIntents = await prisma.playIntent.findMany({
    where: {
      windowStartsAt: {
        lte: now
      },
      windowEndsAt: {
        gt: now
      }
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      windowStartsAt: true,
      user: {
        select: {
          displayName: true
        }
      },
      notifications: {
        where: {
          type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
        },
        select: {
          id: true
        }
      }
    }
  })

  const scheduledIntents = candidateIntents.filter((intent) =>
    intent.windowStartsAt.getTime() > intent.createdAt.getTime() + 60 * 1000 && intent.notifications.length === 0
  )

  if (scheduledIntents.length === 0) {
    return
  }

  for (const intent of scheduledIntents) {
    const checkInNotification = await prisma.notification.create({
      data: {
        userId: intent.userId,
        triggeredByUserId: intent.userId,
        playIntentId: intent.id,
        type: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
        title: 'Is your scheduled call to play still on?',
        body: 'Your scheduled call to play is starting now. Confirm if it is still on.'
      },
      select: {
        id: true
      }
    })

    const creatorIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: intent.userId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    })

    if (!creatorIdentity?.providerUserId) {
      continue
    }

    const promptEmbeds = buildScheduledCheckInEmbeds(buildDiscordUserLabel(intent.user.displayName, creatorIdentity.providerUserId))

    const dmResult = (await sendDiscordDirectMessages([
      {
        discordUserId: creatorIdentity.providerUserId,
        content: '',
        embeds: promptEmbeds,
        components: buildScheduledPlayIntentCheckInComponents(checkInNotification.id)
      }
    ]))[0]

    if (dmResult?.status === 'sent' && !dmResult.emulated) {
      await prisma.notification.update({
        where: {
          id: checkInNotification.id
        },
        data: {
          deliveredAt: new Date(),
          discordDmChannelId: dmResult.channelId,
          discordDmMessageId: dmResult.messageId
        }
      })
    }

    await syncCreatorPlayIntentSummaryMessages([intent.id])
  }
}

export async function expirePendingPlayIntentNotifications(
  playIntentIds: string[],
  options: ExpirePendingPlayIntentNotificationsOptions = {}
) {
  if (playIntentIds.length === 0) {
    return
  }

  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId: {
        in: playIntentIds
      },
      type: {
        in: [
          NotificationType.FRIEND_PLAYING,
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ]
      },
      respondedAt: null
    },
    select: {
      id: true,
      type: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
      game: {
        select: {
          title: true
        }
      },
      playIntent: {
        select: {
          user: {
            select: {
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    }
  })

  await Promise.all(notifications.map(async (notification) => {
    const result = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        respondedAt: null
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.EXPIRED
      }
    })

    if (result.count === 0 || !notification.discordDmChannelId || !notification.discordDmMessageId) {
      return
    }

    const expiredContent = notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      ? buildExpiredMessage('This call to play expired before you confirmed.')
      : buildExpiredMessage(
          buildSessionEndedReason(
            buildDiscordUserLabel(
              notification.playIntent?.user.displayName ?? 'This player',
              notification.playIntent?.user.identities?.[0]?.providerUserId
            ),
            notification.game?.title ?? null
          )
        )

    await editDiscordDirectMessage({
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      content: expiredContent,
      components: [buildLinkRow()]
    })
  }))

  await syncCreatorPlayIntentSummaryMessages(playIntentIds)
  await archivePlayIntentDirectMessages({
    playIntentIds,
    replaceRecipientMessages: options.notifyAudienceOnEnd === true
  })
}

export async function handleScheduledPlayIntentCheckInInteraction(interaction: ButtonInteraction) {
  const action = parseScheduledCheckInAction(interaction.customId)

  if (!action) {
    return
  }

  const [notification, identity] = await Promise.all([
    prisma.notification.findUnique({
      where: {
        id: action.notificationId
      },
      select: {
        id: true,
        userId: true,
        playIntentId: true,
        respondedAt: true,
        responseChoice: true,
        playIntent: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            user: {
              select: {
                displayName: true,
                identities: {
                  where: {
                    provider: AuthProvider.DISCORD
                  },
                  select: {
                    providerUserId: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id
        }
      },
      select: {
        userId: true
      }
    })
  ])

  if (!notification || !identity || identity.userId !== notification.userId) {
    await interaction.update({
      content: buildExpiredMessage('This scheduled call-to-play check-in is not available for your account anymore.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (notification.respondedAt) {
    await interaction.update({
      content: buildCreatorCheckInAlreadyHandledMessage(notification.responseChoice),
      components: [buildLinkRow()]
    })
    return
  }

  if (!notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('This call to play is no longer active.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (action.response === NotificationResponseChoice.CANCELED) {
    const now = new Date()
    const cancellation = await prisma.$transaction(async (transaction) => {
      const cancelResult = await transaction.notification.updateMany({
        where: {
          id: notification.id,
          respondedAt: null
        },
        data: {
          respondedAt: now,
          responseChoice: NotificationResponseChoice.CANCELED
        }
      })

      if (cancelResult.count === 0 || !notification.playIntentId) {
        return {
          notificationCanceled: cancelResult.count > 0
        }
      }

      await transaction.playIntent.updateMany({
        where: {
          id: notification.playIntentId,
          userId: notification.userId,
          expiresAt: {
            gt: now
          }
        },
        data: {
          expiresAt: now,
          windowEndsAt: now
        }
      })

      return {
        notificationCanceled: true
      }
    })

    if (cancellation.notificationCanceled && notification.playIntentId) {
      await expirePendingPlayIntentNotifications([notification.playIntentId], {
        notifyAudienceOnEnd: true
      })
    }

    await interaction.update({
      content: cancellation.notificationCanceled
        ? buildCreatorCanceledMessage()
        : buildCreatorCheckInAlreadyHandledMessage(NotificationResponseChoice.CANCELED),
      components: [buildLinkRow()]
    })
    return
  }

  const playIntent = notification.playIntent
  const goTimeConfirmedCopy = buildGoTimeConfirmedCopy(playIntent.user.displayName)
  const goTimeReminderCopy = buildGoTimeReminderCopy(playIntent.user.displayName)

  const result = await prisma.$transaction(async (transaction) => {
    const updateResult = await transaction.notification.updateMany({
      where: {
        id: notification.id,
        respondedAt: null
      },
      data: {
        respondedAt: new Date(),
        responseChoice: NotificationResponseChoice.CONFIRMED
      }
    })

    if (updateResult.count === 0) {
      return null
    }

    const recipientNotifications = await transaction.notification.findMany({
      where: {
        playIntentId: playIntent.id,
        type: {
          in: [
            NotificationType.FRIEND_PLAYING,
            NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
            NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
          ]
        },
        userId: {
          not: playIntent.userId
        }
      },
      select: {
        userId: true,
        responseChoice: true,
        respondedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const latestRecipientStatusByUserId = new Map<string, { respondedAt: Date | null; responseChoice: NotificationResponseChoice | null }>()
    for (const recipientNotification of recipientNotifications) {
      if (!latestRecipientStatusByUserId.has(recipientNotification.userId)) {
        latestRecipientStatusByUserId.set(recipientNotification.userId, {
          respondedAt: recipientNotification.respondedAt,
          responseChoice: recipientNotification.responseChoice
        })
      }
    }

    const mutedRecipientUserIds = new Set((await transaction.playIntentMute.findMany({
      where: {
        mutedUserId: playIntent.userId,
        userId: {
          in: [...latestRecipientStatusByUserId.keys()]
        }
      },
      select: {
        userId: true
      }
    })).map((mute) => mute.userId))

    const acceptedUserIds: string[] = []
    const unansweredUserIds: string[] = []

    for (const [recipientUserId, status] of latestRecipientStatusByUserId.entries()) {
      if (status.responseChoice === NotificationResponseChoice.DECLINE || mutedRecipientUserIds.has(recipientUserId)) {
        continue
      }

      if (status.responseChoice === NotificationResponseChoice.JOIN) {
        acceptedUserIds.push(recipientUserId)
        continue
      }

      if (!status.respondedAt) {
        unansweredUserIds.push(recipientUserId)
      }
    }

    const confirmedNotifications = acceptedUserIds.length > 0
      ? await Promise.all(acceptedUserIds.map((recipientUserId) => transaction.notification.create({
        data: {
          userId: recipientUserId,
          triggeredByUserId: playIntent.userId,
          playIntentId: playIntent.id,
          type: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
          title: goTimeConfirmedCopy.title,
          body: goTimeConfirmedCopy.body
        },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          type: true
        }
      })))
      : []

    const reminderNotifications = unansweredUserIds.length > 0
      ? await Promise.all(unansweredUserIds.map((recipientUserId) => transaction.notification.create({
        data: {
          userId: recipientUserId,
          triggeredByUserId: playIntent.userId,
          playIntentId: playIntent.id,
          type: NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          title: goTimeReminderCopy.title,
          body: goTimeReminderCopy.body
        },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          type: true
        }
      })))
      : []

    return {
      createdNotifications: [...confirmedNotifications, ...reminderNotifications],
      priorAcceptedCount: acceptedUserIds.length,
      acceptedUserIds
    }
  })

  if (!result) {
    await interaction.update({
      content: buildCreatorCheckInAlreadyHandledMessage(NotificationResponseChoice.CONFIRMED),
      components: [buildLinkRow()]
    })
    return
  }

  const [recipientIdentities, creatorIdentity, acceptedUsers] = await Promise.all([
    prisma.userIdentity.findMany({
      where: {
        provider: AuthProvider.DISCORD,
        userId: {
          in: result.createdNotifications.map((createdNotification) => createdNotification.userId)
        }
      },
      select: {
        userId: true,
        providerUserId: true
      }
    }),
    prisma.userIdentity.findFirst({
      where: {
        provider: AuthProvider.DISCORD,
        userId: playIntent.userId
      },
      select: {
        providerUserId: true
      }
    }),
    prisma.user.findMany({
      where: {
        id: {
          in: result.acceptedUserIds
        }
      },
      select: {
        id: true,
        displayName: true,
        identities: {
          where: {
            provider: AuthProvider.DISCORD
          },
          select: {
            providerUserId: true
          }
        }
      }
    })
  ])
  const creatorDiscordUserId = creatorIdentity?.providerUserId ?? null
  const discordUserIdByUserId = new Map(recipientIdentities.map((identityEntry) => [identityEntry.userId, identityEntry.providerUserId]))
  const acceptedUserLabels = acceptedUsers.map((user) => buildDiscordUserLabel(user.displayName, user.identities[0]?.providerUserId))

  const dmTargets = result.createdNotifications
    .flatMap((createdNotification) => {
      const discordUserId = discordUserIdByUserId.get(createdNotification.userId)

      if (!discordUserId) {
        return []
      }

      return [{
        notificationId: createdNotification.id,
        discordUserId,
        content: '',
        embeds: buildPlayIntentDirectMessageEmbeds(
          createdNotification.title,
          createdNotification.body,
          creatorDiscordUserId,
          playIntent.user.displayName,
          null,
          result.priorAcceptedCount,
          acceptedUserLabels
        ),
        components: buildPlayIntentNotificationComponents(createdNotification.id, playIntent.userId, playIntent.user.displayName)
      }]
    })

  if (dmTargets.length > 0) {
    const dmResults = await sendDiscordDirectMessages(
      dmTargets.map((target) => ({
        discordUserId: target.discordUserId,
        content: target.content,
        embeds: target.embeds,
        components: target.components
      }))
    )

    const deliveredTargets = dmTargets
      .map((target) => {
        const sentResult = dmResults.find((candidate) => candidate.discordUserId === target.discordUserId && candidate.status === 'sent')

        return sentResult && !sentResult.emulated
          ? {
              notificationId: target.notificationId,
              channelId: sentResult.channelId,
              messageId: sentResult.messageId
            }
          : null
      })
      .filter((target): target is { notificationId: string; channelId: string | null; messageId: string | null } => target != null)

    await Promise.all(deliveredTargets.map((target) => prisma.notification.update({
      where: {
        id: target.notificationId
      },
      data: {
        deliveredAt: new Date(),
        discordDmChannelId: target.channelId,
        discordDmMessageId: target.messageId
      }
    })))
  }

  await interaction.update({
    content: buildCreatorConfirmedMessage(),
    components: [buildLinkRow()]
  })

  await syncCreatorPlayIntentSummaryMessages([playIntent.id])
}

export async function handlePlayIntentNotificationInteraction(interaction: ButtonInteraction) {
  const muteAction = parseMuteAction(interaction.customId)
  if (muteAction) {
    await handlePlayIntentMuteInteraction(interaction, muteAction)
    return
  }

  const action = parseAction(interaction.customId)

  if (!action) {
    return
  }

  const [notification, identity] = await Promise.all([
    prisma.notification.findUnique({
      where: {
        id: action.notificationId
      },
      select: {
        id: true,
        userId: true,
        triggeredByUserId: true,
        playIntentId: true,
        gameId: true,
        respondedAt: true,
        responseChoice: true,
        user: {
          select: {
            displayName: true
          }
        },
        game: {
          select: {
            title: true
          }
        },
        playIntent: {
          select: {
            id: true,
            userId: true,
            headline: true,
            selectionMode: true,
            expiresAt: true,
            user: {
              select: {
                id: true,
                displayName: true,
                identities: {
                  where: {
                    provider: AuthProvider.DISCORD
                  },
                  select: {
                    providerUserId: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id
        }
      },
      select: {
        userId: true
      }
    })
  ])

  if (!notification || !identity || identity.userId !== notification.userId) {
    await interaction.update({
      content: buildExpiredMessage('This prompt is not available for your account anymore.'),
      components: [buildLinkRow()]
    })
    return
  }

  if (!notification.playIntentId || !notification.playIntent || notification.playIntent.expiresAt <= new Date()) {
    await interaction.update({
      content: buildExpiredMessage('The original call to play is no longer active.'),
      components: [buildLinkRow()]
    })
    return
  }

  const playIntent = notification.playIntent
  const result = await applyRecipientResponseToPlayIntentNotification({
    notification,
    response: action.response
  })

  await interaction.update({
    content: result.discordContent ?? result.content,
    components: buildPlayIntentNotificationComponents(notification.id, playIntent.user.id, playIntent.user.displayName, action.response)
  })
}

async function handlePlayIntentMuteInteraction(interaction: ButtonInteraction, action: PlayIntentMuteAction) {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: interaction.user.id
      }
    },
    select: {
      userId: true
    }
  })

  if (!identity) {
    await interaction.update({
      content: 'Unable to verify your account. Please sign in to Game\'s Up.',
      components: [buildLinkRow()]
    })
    return
  }

  const creatorUser = await prisma.user.findUnique({
    where: {
      id: action.creatorUserId
    },
    select: {
      displayName: true,
      id: true,
      identities: {
        where: {
          provider: AuthProvider.DISCORD
        },
        select: {
          providerUserId: true
        }
      }
    }
  })

  if (!creatorUser) {
    await interaction.update({
      content: 'This player was not found.',
      components: [buildLinkRow()]
    })
    return
  }

  const existingMute = await prisma.playIntentMute.findUnique({
    where: {
      userId_mutedUserId: {
        userId: identity.userId,
        mutedUserId: action.creatorUserId
      }
    }
  })

  if (!existingMute) {
    await prisma.playIntentMute.create({
      data: {
        userId: identity.userId,
        mutedUserId: action.creatorUserId
      }
    })
  }

  await interaction.update({
    content: `Muted ${buildDiscordUserLabel(creatorUser.displayName, creatorUser.identities[0]?.providerUserId)}'s calls to play. You won't see them in your feed.`,
    components: [buildLinkRow()]
  })
}

export async function handleCreatorPlayIntentSummaryInteraction(interaction: ButtonInteraction) {
  const action = parseCreatorPlayIntentSummaryAction(interaction.customId)

  if (!action) {
    return
  }

  const [playIntent, identity] = await Promise.all([
    prisma.playIntent.findUnique({
      where: {
        id: action.playIntentId
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true
      }
    }),
    prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id
        }
      },
      select: {
        userId: true
      }
    })
  ])

  if (!playIntent || !identity || identity.userId !== playIntent.userId) {
    await interaction.update({
      content: 'This call-to-play summary is not available for your account anymore.',
      components: [buildLinkRow()]
    })
    return
  }

  if (playIntent.expiresAt > new Date()) {
    const now = new Date()

    await prisma.playIntent.update({
      where: {
        id: playIntent.id
      },
      data: {
        expiresAt: now,
        windowEndsAt: now
      }
    })

    await expirePendingPlayIntentNotifications([playIntent.id], {
      notifyAudienceOnEnd: true
    })
  } else {
    await syncCreatorPlayIntentSummaryMessages([playIntent.id])
  }

  const refreshedSnapshot = await getCreatorPlayIntentSummarySnapshot(playIntent.id)

  await interaction.update({
    content: refreshedSnapshot ? '' : 'This call to play is already closed.',
    embeds: refreshedSnapshot ? buildCreatorPlayIntentSummaryEmbeds(refreshedSnapshot) : [],
    components: [buildLinkRow()]
  })
}