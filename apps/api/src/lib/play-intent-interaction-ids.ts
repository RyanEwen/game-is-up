// Single source of truth for Discord interaction custom-id prefixes used by
// play-intent and related flows. Keeping these in one place avoids
// drift between the message builders and the cleanup/handler call sites.

export const playIntentNotificationPrefix = 'play-intent-response'
export const playIntentMutePrefix = 'play-intent-mute'
export const scheduledPlayIntentCheckInPrefix = 'scheduled-play-intent-check-in'
export const creatorPlayIntentSummaryPrefix = 'creator-play-intent-summary'
export const autoPlayPromptPrefix = 'auto-play'

export const playIntentFriendInvitePrefix = 'ctp-friend-invite:'
