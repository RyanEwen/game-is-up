/** Resolves audience answers from invitation anchors; informational go-time messages never replace them. */
import { NotificationType, type Prisma } from '@prisma/client'

/** Finds the current invitation, falling back to legacy recipient threads only when no anchor exists. */
export async function findPlayIntentAudienceResponseId(
  database: Prisma.TransactionClient,
  playIntentId: string,
  userId: string,
) {
  const invitation = await database.notification.findFirst({
    where: { playIntentId, userId, type: NotificationType.FRIEND_PLAYING },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (invitation) {
    return invitation.id
  }
  const legacy = await database.notification.findFirst({
    where: {
      playIntentId,
      userId,
      type: {
        in: [
          NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
          NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return legacy?.id ?? null
}

/** Rows arrive newest first. An unanswered anchor still takes precedence after a substantive edit. */
export function resolvePlayIntentAudienceResponse<
  T extends { type: NotificationType },
>(rows: T[]): T | null {
  return (
    rows.find((row) => row.type === NotificationType.FRIEND_PLAYING) ??
    rows.find(
      (row) =>
        row.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER ||
        row.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
    ) ??
    null
  )
}

/** Preserves newest-first order within each type while placing authoritative invitation anchors first. */
export function prioritizePlayIntentAudienceResponses<
  T extends { type: NotificationType },
>(rows: T[]): T[] {
  return [
    ...rows.filter((row) => row.type === NotificationType.FRIEND_PLAYING),
    ...rows.filter((row) => row.type !== NotificationType.FRIEND_PLAYING),
  ]
}
