/**
 * Reference bookkeeping for archived recipient invite anchors.
 *
 * When a play intent ends, every recipient's invite thread collapses onto a
 * single archived anchor. The kept anchor must retain its
 * `Notification.discordDm*` reference so the retention sweep can later find and
 * delete it; any duplicate anchors that were removed have their references
 * cleared. This module computes that per-notification reference update set.
 */

export type ArchivedNotificationCandidate = {
  channelId: string;
  messageId: string;
  notificationId: string;
}

export type NotificationDmReferenceUpdate = {
  discordDmChannelId: string | null;
  discordDmMessageId: string | null;
}

/**
 * Returns the reference update to apply to each candidate notification: the
 * notification owning the kept anchor keeps its reference, every other
 * notification has its reference cleared. The kept reference always wins if a
 * notification somehow appears under multiple candidates.
 */
export function buildArchivedNotificationReferenceUpdates(options: {
  candidates: ArchivedNotificationCandidate[];
  keptMessageId: string;
}) {
  const updates = new Map<string, NotificationDmReferenceUpdate>()

  for (const candidate of options.candidates) {
    const isKept = candidate.messageId === options.keptMessageId
    const existing = updates.get(candidate.notificationId)

    if (existing?.discordDmMessageId != null && !isKept) {
      continue
    }

    updates.set(candidate.notificationId, {
      discordDmChannelId: isKept ? candidate.channelId : null,
      discordDmMessageId: isKept ? candidate.messageId : null
    })
  }

  return updates
}
