/**
 * Single per-recipient "updates log" Discord DM for an active call to play.
 *
 * Every SYSTEM update on a play intent (interest confirmed, pass, running
 * late, voice-channel join, game launch) lands in one DM per
 * (playIntentId, recipientUserId) that lists all updates newest-first,
 * instead of one DM per event.
 *
 * Invariants:
 * - The log DM's channel/message ids are tracked on exactly one SYSTEM
 *   notification row for the pair (the newest entry). All other SYSTEM rows
 *   keep null DM refs so the sweep/archive/prune flows see a single tracked
 *   message per recipient.
 * - A new event deletes and re-sends the DM (`sync...`): a fresh message is
 *   the only way Discord raises a push notification for the update. Quiet
 *   corrections (startup refresh, entry deletion after a substantive edit)
 *   edit the tracked message in place (`refresh...`).
 * - Entry lines use the stored plain-text `body` (display names, no `<@id>`
 *   mentions): Android push notifications render mention markup literally.
 *   Mentions stay on the original invite/summary DMs, which is where readers
 *   can open a profile or add a friend.
 * - "Call to play ended" SYSTEM notifications are excluded: the archived
 *   end-of-call DM belongs to the cleanup flow in `discord-dm-cleanup.ts`.
 */

import { NotificationType } from '@prisma/client'
import {
  deleteDiscordDirectMessage,
  editDiscordDirectMessage,
  sendDiscordDirectMessages,
  type DiscordDirectMessagePayload
} from './discord-bot-runtime.js'
import { isMissingDiscordMessageError } from './discord-tracked-direct-message.js'
import { buildDiscordMessageHeading, buildDiscordPlainMessage } from './discord-dm-formatting.js'
import { callToPlayEndedSystemNotification } from './play-intent-system-notifications.js'
import { prisma } from './prisma.js'

export type PlayIntentUpdatesLogEntry = {
  title: string;
  body: string;
}

/**
 * Discord messages cap out at 2000 characters; keep the log comfortably under
 * that by rendering only the most recent entries and summarizing the rest.
 */
const maxRenderedUpdatesLogEntries = 12

const defaultPlayIntentHeadline = 'Call to play'

/**
 * Notification types whose tracked DM anchors the recipient-side reply
 * thread. The log DM is sent as a reply to the newest anchor so it threads
 * under the original invite (or the latest go-time nudge).
 */
const updatesLogReplyAnchorNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as NotificationType[]

export function buildTrackedDirectMessageReplyReference(
  channelId: string | null | undefined,
  messageId: string | null | undefined
): DiscordDirectMessagePayload['replyTo'] {
  if (!channelId || !messageId) {
    return undefined
  }

  return {
    channelId,
    messageId
  }
}

/** Reply reference pointing at the creator's tracked summary DM. */
export async function getCreatorPlayIntentSummaryReplyReference(playIntentId: string) {
  const playIntent = await prisma.playIntent.findUnique({
    where: {
      id: playIntentId
    },
    select: {
      creatorDiscordDmChannelId: true,
      creatorDiscordDmMessageId: true
    }
  })

  return buildTrackedDirectMessageReplyReference(
    playIntent?.creatorDiscordDmChannelId,
    playIntent?.creatorDiscordDmMessageId
  )
}

/** Reply reference pointing at the recipient's newest tracked invite/go-time DM. */
export async function getAudiencePlayIntentReplyReference(playIntentId: string, userId: string) {
  const notification = await prisma.notification.findFirst({
    where: {
      playIntentId,
      userId,
      type: {
        in: updatesLogReplyAnchorNotificationTypes
      },
      discordDmChannelId: {
        not: null
      },
      discordDmMessageId: {
        not: null
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })

  return buildTrackedDirectMessageReplyReference(
    notification?.discordDmChannelId,
    notification?.discordDmMessageId
  )
}

/**
 * Pulls the leading emoji decoration off a system-notification title (e.g.
 * "✅ Someone is interested") so log entries can reuse it. Titles that start
 * with a word have no decoration and return null.
 */
function extractTitleDecoration(title: string) {
  const [firstToken] = title.trim().split(/\s+/u)

  if (!firstToken || /[\p{L}\p{N}]/u.test(firstToken)) {
    return null
  }

  return firstToken
}

function formatUpdatesLogEntryLine(entry: PlayIntentUpdatesLogEntry) {
  const decoration = extractTitleDecoration(entry.title)
  const body = entry.body.replace(/\s*\n\s*/gu, ' ').trim()

  return decoration ? `${decoration} ${body}` : body
}

/**
 * Renders the full log DM content from entries ordered newest-first. Exported
 * so the debug DM preview surfaces render exactly what the bot sends.
 */
export function buildPlayIntentUpdatesLogContent(options: {
  headline?: string | null;
  entries: PlayIntentUpdatesLogEntry[];
}) {
  const headline = options.headline?.trim()
  const heading = buildDiscordMessageHeading(
    headline && headline !== defaultPlayIntentHeadline
      ? `📣 Updates — ${headline}`
      : '📣 Call to Play Updates'
  )
  const renderedEntries = options.entries.slice(0, maxRenderedUpdatesLogEntries)
  const hiddenEntryCount = options.entries.length - renderedEntries.length

  return buildDiscordPlainMessage(
    heading,
    renderedEntries.map((entry) => formatUpdatesLogEntryLine(entry)),
    {
      trailingSubtext: hiddenEntryCount > 0
        ? `…and ${hiddenEntryCount} earlier ${hiddenEntryCount === 1 ? 'update' : 'updates'}.`
        : null
    }
  )
}

type UpdatesLogNotificationRow = {
  id: string;
  title: string;
  body: string;
  discordDmChannelId: string | null;
  discordDmMessageId: string | null;
}

async function getUpdatesLogState(playIntentId: string, recipientUserId: string) {
  const [playIntent, rows] = await Promise.all([
    prisma.playIntent.findUnique({
      where: {
        id: playIntentId
      },
      select: {
        userId: true,
        headline: true
      }
    }),
    prisma.notification.findMany({
      where: {
        playIntentId,
        userId: recipientUserId,
        type: NotificationType.SYSTEM,
        title: {
          not: callToPlayEndedSystemNotification.title
        }
      },
      orderBy: [
        {
          createdAt: 'desc'
        },
        {
          id: 'desc'
        }
      ],
      select: {
        id: true,
        title: true,
        body: true,
        discordDmChannelId: true,
        discordDmMessageId: true
      }
    })
  ])

  return {
    playIntent,
    rows: rows as UpdatesLogNotificationRow[]
  }
}

function collectTrackedMessages(rows: UpdatesLogNotificationRow[]) {
  const trackedMessages = new Map<string, { channelId: string; messageId: string }>()

  for (const row of rows) {
    if (row.discordDmChannelId && row.discordDmMessageId) {
      trackedMessages.set(`${row.discordDmChannelId}:${row.discordDmMessageId}`, {
        channelId: row.discordDmChannelId,
        messageId: row.discordDmMessageId
      })
    }
  }

  return trackedMessages
}

async function clearUpdatesLogReferences(rowIds: string[]) {
  if (rowIds.length === 0) {
    return
  }

  await prisma.notification.updateMany({
    where: {
      id: {
        in: rowIds
      }
    },
    data: {
      discordDmChannelId: null,
      discordDmMessageId: null
    }
  })
}

/**
 * Delete-and-recreate sync for a new log event. Sends a fresh DM with the
 * full log (so the recipient gets a push notification), moves the tracked
 * refs onto the newest entry row, and deletes the previous log message(s).
 * Falls back to editing the existing message in place if the resend fails.
 */
export async function syncPlayIntentUpdatesLogDirectMessage(options: {
  playIntentId: string;
  recipientUserId: string;
  discordUserId: string;
}) {
  const { playIntent, rows } = await getUpdatesLogState(options.playIntentId, options.recipientUserId)

  if (!playIntent || rows.length === 0) {
    return
  }

  const newestRow = rows[0]

  if (!newestRow) {
    return
  }

  const content = buildPlayIntentUpdatesLogContent({
    headline: playIntent.headline,
    entries: rows
  })
  const trackedMessages = collectTrackedMessages(rows)
  const replyTo = options.recipientUserId === playIntent.userId
    ? await getCreatorPlayIntentSummaryReplyReference(options.playIntentId)
    : await getAudiencePlayIntentReplyReference(options.playIntentId, options.recipientUserId)

  const sendResult = (await sendDiscordDirectMessages([
    {
      discordUserId: options.discordUserId,
      content,
      components: [],
      replyTo
    }
  ]))[0]

  if (sendResult?.status === 'sent' && sendResult.emulated) {
    return
  }

  if (sendResult?.status === 'sent' && sendResult.channelId && sendResult.messageId) {
    await prisma.notification.update({
      where: {
        id: newestRow.id
      },
      data: {
        deliveredAt: new Date(),
        discordDmChannelId: sendResult.channelId,
        discordDmMessageId: sendResult.messageId
      }
    })
    await clearUpdatesLogReferences(rows.slice(1).filter((row) => row.discordDmChannelId || row.discordDmMessageId).map((row) => row.id))

    const newMessageKey = `${sendResult.channelId}:${sendResult.messageId}`

    await Promise.all(
      [...trackedMessages.entries()]
        .filter(([key]) => key !== newMessageKey)
        .map(([, message]) => deleteDiscordDirectMessage(message))
    )

    return
  }

  // Resend failed: recover quietly by editing the previous log message so it
  // at least shows the latest entries.
  await refreshPlayIntentUpdatesLogDirectMessage({
    playIntentId: options.playIntentId,
    recipientUserId: options.recipientUserId
  })
}

/**
 * Quiet in-place refresh of an already-tracked log DM (no new notification).
 * Used by the startup refresh sweep and after log entries are deleted (e.g.
 * a substantive edit revoked prior responses). No-op when the pair has no
 * tracked log message.
 */
export async function refreshPlayIntentUpdatesLogDirectMessage(options: {
  playIntentId: string;
  recipientUserId: string;
}) {
  const { playIntent, rows } = await getUpdatesLogState(options.playIntentId, options.recipientUserId)

  if (!playIntent) {
    return
  }

  const trackedRows = rows.filter((row) => row.discordDmChannelId && row.discordDmMessageId)

  if (trackedRows.length === 0) {
    return
  }

  const content = buildPlayIntentUpdatesLogContent({
    headline: playIntent.headline,
    entries: rows
  })

  await Promise.all(trackedRows.map(async (row) => {
    const editResult = await editDiscordDirectMessage({
      channelId: row.discordDmChannelId as string,
      messageId: row.discordDmMessageId as string,
      content,
      components: []
    })

    if (editResult.status === 'failed' && isMissingDiscordMessageError(editResult.error)) {
      await clearUpdatesLogReferences([row.id])
    }
  }))
}
