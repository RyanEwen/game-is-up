export type ArchivedNotificationCandidateReference = 'notification' | 'response'

export type ArchivedNotificationCandidate = {
  channelId: string;
  messageId: string;
  notificationId: string;
  reference: ArchivedNotificationCandidateReference;
}

export type NotificationDmReferenceUpdate = {
  discordDmChannelId: string | null;
  discordDmMessageId: string | null;
  recipientResponseDiscordDmChannelId: string | null;
  recipientResponseDiscordDmMessageId: string | null;
}

export function createNotificationDmReferenceUpdate(): NotificationDmReferenceUpdate {
  return {
    discordDmChannelId: null,
    discordDmMessageId: null,
    recipientResponseDiscordDmChannelId: null,
    recipientResponseDiscordDmMessageId: null
  }
}

export function preserveArchivedNotificationCandidateReference(
  update: NotificationDmReferenceUpdate,
  candidate: ArchivedNotificationCandidate
) {
  if (candidate.reference === 'notification') {
    update.discordDmChannelId = candidate.channelId
    update.discordDmMessageId = candidate.messageId
    return
  }

  update.recipientResponseDiscordDmChannelId = candidate.channelId
  update.recipientResponseDiscordDmMessageId = candidate.messageId
}

export function buildArchivedNotificationReferenceUpdates(options: {
  candidates: ArchivedNotificationCandidate[];
  keptMessageId: string;
  replacementResponse?: {
    notificationId: string;
    channelId: string;
    messageId: string;
  } | null;
}) {
  const updates = new Map<string, NotificationDmReferenceUpdate>()

  const getUpdate = (notificationId: string) => {
    const existingUpdate = updates.get(notificationId)

    if (existingUpdate) {
      return existingUpdate
    }

    const nextUpdate = createNotificationDmReferenceUpdate()
    updates.set(notificationId, nextUpdate)
    return nextUpdate
  }

  for (const candidate of options.candidates) {
    getUpdate(candidate.notificationId)
  }

  const keptCandidate = options.candidates.find((candidate) => candidate.messageId === options.keptMessageId) ?? null

  if (keptCandidate) {
    preserveArchivedNotificationCandidateReference(
      getUpdate(keptCandidate.notificationId),
      keptCandidate
    )
  }

  if (options.replacementResponse) {
    const update = getUpdate(options.replacementResponse.notificationId)
    update.recipientResponseDiscordDmChannelId = options.replacementResponse.channelId
    update.recipientResponseDiscordDmMessageId = options.replacementResponse.messageId
  }

  return updates
}