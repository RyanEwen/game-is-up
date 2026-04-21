import { z } from 'zod'

export const authProviderSchema = z.enum(['discord', 'steam'])
export const discordBotModeSchema = z.enum(['off', 'rest', 'gateway'])
export const platformLabelSchema = z.string().trim().min(1).max(32)
export const catalogProviderSchema = z.string().trim().min(1).max(32)
export const availabilitySourceSchema = z.enum(['profile-default', 'game-specific'])
export const timezoneIdSchema = z.string().trim().min(1).max(64)

export const availabilityWindowSchema = z.object({
  label: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
})

export const libraryEntryIntentSchema = z.enum(['wishlist', 'interested', 'playing-now'])

export const catalogGameMatchSchema = z.object({
  source: catalogProviderSchema,
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().trim().min(1).max(120),
  coverUrl: z.string().url().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  platformLabels: z.array(platformLabelSchema).default([])
})

export const libraryEntrySchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: libraryEntryIntentSchema,
  availability: z.string().nullable(),
  availabilitySource: availabilitySourceSchema.nullable()
})

export const librarySuggestedGameSchema = z.object({
  gameId: z.string().uuid(),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  lastObservedAt: z.string().datetime(),
  sourceServerName: z.string().min(1).nullable()
})

export const libraryTrendingGameSchema = z.object({
  gameId: z.string().uuid(),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  recentPlayerCount: z.number().int().positive(),
  alreadyInLibrary: z.boolean()
})

export const libraryResponseSchema = z.object({
  usualAvailability: z.string().nullable(),
  entries: z.array(libraryEntrySchema),
  suggestedGames: z.array(librarySuggestedGameSchema).default([]),
  trendingGames: z.array(libraryTrendingGameSchema).default([])
})

export const steamLibraryImportStatusSchema = z.enum(['not-linked', 'ready', 'unavailable'])

export const steamLibraryImportGameSchema = z.object({
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  minutesPlayedTotal: z.number().int().nonnegative(),
  minutesPlayedRecent: z.number().int().nonnegative(),
  alreadyInLibrary: z.boolean()
})

export const steamLibraryImportAccountSchema = z.object({
  steamId: z.string().trim().min(1).max(32),
  displayName: z.string().trim().min(1).max(120),
  avatarUrl: z.string().url().nullable(),
  profileUrl: z.string().url().nullable()
})

export const steamLibraryImportPreviewResponseSchema = z.object({
  status: steamLibraryImportStatusSchema,
  note: z.string().nullable(),
  account: steamLibraryImportAccountSchema.nullable(),
  games: z.array(steamLibraryImportGameSchema).default([])
})

export const steamLinkIntentResponseSchema = z.object({
  authorizationUrl: z.string().url()
})

export const steamLibraryImportSelectionSchema = z.object({
  sourceId: z.string().trim().min(1).max(96),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: libraryEntryIntentSchema,
  availability: z.string().trim().max(80).optional()
})

export const importSteamLibrarySelectionRequestSchema = z.object({
  games: z.array(steamLibraryImportSelectionSchema).min(1).max(500)
})

export const gameSearchResultSchema = z.object({
  id: z.string().min(1),
  source: catalogProviderSchema,
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema)
})

export const gameSearchResponseSchema = z.object({
  results: z.array(gameSearchResultSchema)
})

export const discordServerPreferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.string().url().nullable(),
  botPresent: z.boolean(),
  selected: z.boolean(),
  knownUserCount: z.number().int().nonnegative()
})

export const discordServerPreferencesResponseSchema = z.object({
  servers: z.array(discordServerPreferenceSchema)
})

export const discordServerMemberSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  profileDisplayName: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  isAppUser: z.boolean(),
  appUserId: z.string().uuid().nullable(),
  appDisplayName: z.string().min(1).nullable(),
  appHandle: z.string().min(1).nullable()
})

export const discordServerMembersResponseSchema = z.object({
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  members: z.array(discordServerMemberSchema)
})

export const discordVoiceChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  serverIconUrl: z.string().url().nullable()
})

export const discordVoiceChannelsResponseSchema = z.object({
  channels: z.array(discordVoiceChannelSchema)
})

export const playIntentTargetDiscordServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.string().url().nullable()
})

export const sendDiscordServerInvitesRequestSchema = z.object({
  inviteUrl: z.string().url(),
  memberIds: z.array(z.string().min(1)).min(1).max(25)
})

export const sendDiscordServerInvitesResultSchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  username: z.string().min(1),
  status: z.enum(['sent', 'failed']),
  error: z.string().min(1).nullable()
})

export const sendDiscordServerInvitesResponseSchema = z.object({
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  results: z.array(sendDiscordServerInvitesResultSchema)
})

export const updateDiscordServerPreferenceRequestSchema = z.object({
  selected: z.boolean()
})

export const upsertLibraryEntryRequestSchema = z.object({
  title: z.string().trim().min(1).max(80),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: libraryEntryIntentSchema,
  availability: z.string().trim().max(80).optional(),
  catalogMatch: catalogGameMatchSchema.optional()
})

export const playIntentSelectionModeSchema = z.enum(['library', 'subset'])
export const playIntentNotifyScopeSchema = z.enum(['network', 'friends-only', 'specific-friends', 'specific-discord-server'])

export const playIntentDiscordSpaceStatusSchema = z.enum([
  'requested',
  'provisioning',
  'active',
  'retained',
  'delete-requested',
  'deleted',
  'provision-failed'
])

export const playIntentDiscordSpaceSchema = z.object({
  status: playIntentDiscordSpaceStatusSchema,
  serverId: z.string().min(1),
  categoryChannelName: z.string().min(1).nullable(),
  textChannelName: z.string().min(1).nullable(),
  textChannelUrl: z.string().url().nullable(),
  voiceChannelName: z.string().min(1).nullable(),
  voiceChannelUrl: z.string().url().nullable(),
  inviteUrl: z.string().url().nullable(),
  deleteAfter: z.string().datetime().nullable(),
  lastSyncError: z.string().min(1).nullable().default(null)
})

export const playIntentGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  platform: z.string().min(1),
  coverUrl: z.string().url().nullable()
})

export const playIntentPreviewUserSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.string().url().nullable()
})

export const playIntentPreviewSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  status: z.enum(['active', 'ended']),
  appliesToViewer: z.boolean(),
  user: playIntentPreviewUserSchema,
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  targetServers: z.array(playIntentTargetDiscordServerSchema).default([]),
  platforms: z.array(z.string()).min(1),
  games: z.array(playIntentGameSchema),
  note: z.string().max(140),
  voiceChannelId: z.string().min(1).nullable(),
  voiceChannelName: z.string().min(1).nullable(),
  discordSpace: playIntentDiscordSpaceSchema.nullable().default(null),
  viewerResponseChoice: z.enum(['interested', 'pass']).nullable().default(null),
  interestedUsers: z.array(playIntentPreviewUserSchema).default([]),
  interestedCount: z.number().int().min(0),
  availabilityWindow: availabilityWindowSchema
})

export const playIntentExpandedGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1)
})

export const playIntentExpandedGameScopeSchema = z.object({
  kind: z.enum(['creator-library', 'shared-library']),
  title: z.string().min(1),
  description: z.string().min(1),
  totalCount: z.number().int().min(0),
  games: z.array(playIntentExpandedGameSchema).default([]),
  nonOverlappingGames: z.array(playIntentExpandedGameSchema).default([])
})

export const playIntentDetailSchema = playIntentPreviewSchema.extend({
  createdAt: z.string().datetime(),
  audienceSummary: z.string().min(1),
  passedUsers: z.array(playIntentPreviewUserSchema).default([]),
  targetedFriends: z.array(playIntentPreviewUserSchema).default([]),
  expandedGameScope: playIntentExpandedGameScopeSchema.nullable().default(null)
})

export const playIntentFeedSchema = z.object({
  generatedAt: z.string().datetime(),
  intents: z.array(playIntentPreviewSchema)
})

export const playIntentDetailResponseSchema = z.object({
  intent: playIntentDetailSchema
})

export const activePlayIntentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  targetServers: z.array(playIntentTargetDiscordServerSchema).default([]),
  targetedFriends: z.array(playIntentPreviewUserSchema),
  platforms: z.array(platformLabelSchema).min(1),
  games: z.array(playIntentGameSchema),
  note: z.string().max(140),
  voiceChannelId: z.string().min(1).nullable(),
  voiceChannelName: z.string().min(1).nullable(),
  discordSpace: playIntentDiscordSpaceSchema.nullable().default(null),
  windowStartsAt: z.string().datetime(),
  windowEndsAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  interestedUsers: z.array(playIntentPreviewUserSchema).default([]),
  interestedCount: z.number().int().min(0)
})

export const playIntentCurrentResponseSchema = z.object({
  activeIntent: activePlayIntentSchema.nullable()
})

export const playIntentRecipientResponseChoiceSchema = z.enum(['interested', 'pass'])

export const playIntentRecipientResponseRequestSchema = z.object({
  choice: playIntentRecipientResponseChoiceSchema
})

export const playIntentRecipientResponseResultSchema = z.object({
  responseChoice: playIntentRecipientResponseChoiceSchema,
  message: z.string().min(1)
})

export const playIntentDiscordSpaceDeleteResponseSchema = z.object({
  status: z.enum(['deleted', 'missing']),
  message: z.string().min(1)
})

export const playIntentDiscordSpaceRetryResponseSchema = z.object({
  status: z.enum(['retrying', 'missing']),
  message: z.string().min(1)
})

export const upsertPlayIntentRequestSchema = z.object({
  playIntentId: z.string().uuid().optional(),
  title: z.string().trim().max(80).optional(),
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  includeSelf: z.boolean().optional().default(false),
  createDiscordSpace: z.boolean().optional().default(false),
  note: z.string().trim().max(140).optional(),
  voiceChannelId: z.string().trim().min(1).max(32).optional(),
  voiceChannelName: z.string().trim().min(1).max(100).optional(),
  startAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(1440).optional(),
  endAt: z.string().datetime().optional(),
  gameIds: z.array(z.string().uuid()).default([]),
  targetUserIds: z.array(z.string().uuid()).max(25).default([]),
  targetDiscordServerIds: z.array(z.string().trim().min(1).max(64)).max(25).default([])
}).superRefine((value, context) => {
  if ((value.durationMinutes == null) === (value.endAt == null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either a duration or an end time for the play intent.',
      path: ['durationMinutes']
    })
  }

  if (value.notifyScope === 'specific-friends' && value.targetUserIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose at least one friend for a specific-friends call to play.',
      path: ['targetUserIds']
    })
  }

  if (value.notifyScope !== 'specific-friends' && value.targetUserIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Specific target friends are only valid for the specific-friends audience.',
      path: ['targetUserIds']
    })
  }

  if (value.notifyScope === 'specific-discord-server' && value.targetDiscordServerIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose at least one Discord server for a specific Discord server call to play.',
      path: ['targetDiscordServerIds']
    })
  }

  if (value.notifyScope !== 'specific-discord-server' && value.targetDiscordServerIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Target Discord servers are only valid for the specific Discord server audience.',
      path: ['targetDiscordServerIds']
    })
  }

  if (value.createDiscordSpace && (value.voiceChannelId || value.voiceChannelName)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose either an existing voice channel or a temporary Discord channel.',
      path: ['voiceChannelId']
    })
  }

  if ((value.voiceChannelId == null) !== (value.voiceChannelName == null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Voice channel selections must include both the channel id and name.',
      path: ['voiceChannelId']
    })
  }
})

export const upsertPlayIntentResponseSchema = z.object({
  activeIntent: activePlayIntentSchema,
  notifiedFriendCount: z.number().int().nonnegative()
})

export const discoveryPersonGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: z.enum(['wishlist', 'interested', 'playing-now']),
  availability: z.string().nullable(),
  availabilitySource: availabilitySourceSchema.nullable()
})

export const discoveryPersonSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.string().url().nullable(),
  discordUserId: z.string().min(1).nullable(),
  bio: z.string().max(280),
  timezoneId: timezoneIdSchema,
  timezoneLabel: z.string().min(2).max(24),
  usualAvailability: z.string().nullable(),
  mutualServerIds: z.array(z.string().min(1)),
  mutualServers: z.array(z.string().min(1)),
  games: z.array(discoveryPersonGameSchema),
  discordActivity: z.object({
    title: z.string().min(1),
    applicationId: z.string().nullable(),
    activityType: z.enum(['playing', 'competing']),
    isActive: z.boolean(),
    details: z.string().nullable(),
    state: z.string().nullable(),
    startedAt: z.string().datetime().nullable(),
    firstObservedAt: z.string().datetime(),
    lastObservedAt: z.string().datetime(),
    sourceServerName: z.string().nullable()
  }).nullable(),
  lastActiveLabel: z.string(),
  isFriend: z.boolean(),
  friendEligible: z.boolean(),
  contactHint: z.string()
})

export const discoveryGamePlayerSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.string().url().nullable(),
  discordUserId: z.string().min(1).nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: z.enum(['wishlist', 'interested', 'playing-now']),
  availability: z.string().nullable(),
  availabilitySource: availabilitySourceSchema.nullable(),
  mutualServers: z.array(z.string().min(1)),
  isFriend: z.boolean(),
  friendEligible: z.boolean(),
  contactHint: z.string()
})

export const discoveryGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  coverUrl: z.string().url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  sharedWithViewer: z.boolean(),
  playerCount: z.number().int().positive(),
  players: z.array(discoveryGamePlayerSchema).min(1)
})

export const discoveryFeedSchema = z.object({
  generatedAt: z.string().datetime(),
  games: z.array(discoveryGameSchema),
  people: z.array(discoveryPersonSchema)
})

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.string().datetime(),
  version: z.string()
})

export const authProvidersResponseSchema = z.object({
  providers: z.array(z.object({
    id: authProviderSchema,
    label: z.string(),
    enabled: z.boolean(),
    primary: z.boolean(),
    clientId: z.string().min(1).nullable().optional(),
    requestedScopes: z.array(z.string().min(1)),
    installUrl: z.string().url().nullable().optional(),
    serverInstallUrl: z.string().url().nullable().optional()
  }))
})

export const discordGraphCapabilitiesSchema = z.object({
  requestedScopes: z.array(z.string().min(1)),
  grantedScopes: z.array(z.string().min(1)),
  fallbackSources: z.array(z.enum(['mutual-servers', 'app-friends'])),
  guildSync: z.object({
    active: z.boolean(),
    lastSyncedAt: z.string().datetime().nullable()
  }),
  activityTracking: z.object({
    mode: z.literal('bot-presence-lossy'),
    botConfigured: z.boolean(),
    botConnected: z.boolean(),
    botGuildCount: z.number().int().nonnegative(),
    sharesServerWithBot: z.boolean(),
    lastObservedAt: z.string().datetime().nullable(),
    currentActivity: z.object({
      title: z.string().min(1),
      applicationId: z.string().nullable(),
      activityType: z.enum(['playing', 'competing']),
      details: z.string().nullable(),
      state: z.string().nullable(),
      startedAt: z.string().datetime().nullable(),
      firstObservedAt: z.string().datetime(),
      lastObservedAt: z.string().datetime(),
      sourceServerName: z.string().nullable()
    }).nullable(),
    note: z.string()
  })
})

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.string().url().nullable(),
  email: z.string().email().nullable(),
  timezoneId: timezoneIdSchema,
  usualAvailability: z.string().nullable(),
  discordAutoPromptPlayIntent: z.boolean(),
  isAdmin: z.boolean(),
  authProvider: authProviderSchema
})

export const inviteAttributionKindSchema = z.enum(['direct', 'server'])

export const authSessionInviteAttributionSchema = z.object({
  inviterUserId: z.string().uuid().nullable(),
  inviterDiscordUserId: z.string().min(1).nullable(),
  inviterLabel: z.string().min(1).nullable(),
  inviterDisplayName: z.string().min(1).nullable(),
  inviterHandle: z.string().min(1).nullable(),
  serverId: z.string().min(1).nullable(),
  serverName: z.string().min(1).nullable(),
  memberCount: z.number().int().nonnegative().nullable(),
  kind: inviteAttributionKindSchema,
  acceptedAt: z.string().datetime()
})

export const userProfileSchema = z.object({
  timezoneId: timezoneIdSchema,
  usualAvailability: z.string().nullable(),
  discordAutoPromptPlayIntent: z.boolean()
})

export const userProfileResponseSchema = userProfileSchema

export const updateUserProfileRequestSchema = z.object({
  timezoneId: timezoneIdSchema.optional(),
  usualAvailability: z.string().trim().max(80).optional(),
  discordAutoPromptPlayIntent: z.boolean().optional()
})

export const authSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: authenticatedUserSchema.nullable(),
  discordGraph: discordGraphCapabilitiesSchema.nullable(),
  inviteAttribution: authSessionInviteAttributionSchema.nullable(),
  connectedProviders: z.array(authProviderSchema).default([])
})

export const debugDiscordBotStateSchema = z.object({
  mode: discordBotModeSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  guildIds: z.array(z.string().min(1)),
  guildCount: z.number().int().nonnegative(),
  userTag: z.string().nullable(),
  lastReadyAt: z.string().datetime().nullable(),
  lastError: z.string().nullable()
})

export const debugAutoPlayPromptStatusSchema = z.enum([
  'sent',
  'skipped',
  'failed',
  'accepted',
  'declined',
  'expired'
])

export const debugDmPreviewButtonStyleSchema = z.enum(['primary', 'secondary', 'danger', 'link'])

export const debugDmPreviewButtonSchema = z.object({
  label: z.string().min(1),
  style: debugDmPreviewButtonStyleSchema,
  disabled: z.boolean(),
  url: z.string().min(1).nullable(),
  customId: z.string().min(1).nullable()
})

export const debugDmPreviewEmbedFieldSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  inline: z.boolean()
})

export const debugDmPreviewEmbedSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  color: z.number().int().nonnegative().nullable(),
  fields: z.array(debugDmPreviewEmbedFieldSchema),
  footerText: z.string().nullable(),
  imageUrl: z.string().min(1).nullable(),
  thumbnailUrl: z.string().min(1).nullable()
})

export const debugDmPreviewSchema = z.object({
  content: z.string(),
  embeds: z.array(debugDmPreviewEmbedSchema),
  buttonRows: z.array(z.array(debugDmPreviewButtonSchema))
})

export const debugDmTemplateEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable(),
  preview: debugDmPreviewSchema
})

export const debugDmTemplateGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable(),
  entries: z.array(debugDmTemplateEntrySchema).min(1)
})

export const debugAutoPlayPromptSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable(),
  respondedAt: z.string().datetime().nullable(),
  status: debugAutoPlayPromptStatusSchema,
  statusDetail: z.string().nullable(),
  dmError: z.string().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  notifyScope: playIntentNotifyScopeSchema.nullable(),
  friendRecipientCount: z.number().int().nonnegative(),
  networkRecipientCount: z.number().int().nonnegative(),
  sourceServerName: z.string().nullable(),
  observationStartedAt: z.string().datetime().nullable(),
  createdPlayIntentId: z.string().uuid().nullable(),
  user: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
    discordAutoPromptPlayIntent: z.boolean()
  }),
  game: z.object({
    id: z.string().uuid(),
    title: z.string().min(1)
  }),
  dmPreview: debugDmPreviewSchema.nullable()
})

export const debugNotificationDeliverySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable(),
  title: z.string().min(1),
  body: z.string().min(1),
  gameTitle: z.string().nullable(),
  recipient: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60)
  }),
  triggeredBy: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60)
  }).nullable(),
  dmPreview: debugDmPreviewSchema.nullable()
})

export const debugInviteAttributionSchema = z.object({
  id: z.string().uuid(),
  acceptedAt: z.string().datetime(),
  kind: inviteAttributionKindSchema,
  serverId: z.string().min(1).nullable(),
  serverName: z.string().min(1).nullable(),
  memberCount: z.number().int().nonnegative().nullable(),
  acceptedUser: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60)
  }),
  inviterUser: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60)
  }).nullable(),
  inviterDiscordUserId: z.string().min(1).nullable(),
  inviterLabel: z.string().min(1).nullable()
})

export const debugPlayIntentStatusSchema = z.enum(['active', 'ended'])

export const debugDmInboxRoleSchema = z.enum(['creator', 'audience'])

export const debugDmInboxDeliveryStateSchema = z.enum(['emulated', 'stored-only', 'dm-delivered'])

export const debugDmInboxMessageKindSchema = z.enum([
  'creator-summary',
  'scheduled-check-in',
  'call-to-play',
  'go-time-reminder',
  'go-time-confirmed'
])

export const debugDmInboxMessageRevisionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  occurredAt: z.string().datetime(),
  preview: debugDmPreviewSchema
})

export const debugDmInboxMessageSchema = z.object({
  id: z.string().min(1),
  kind: debugDmInboxMessageKindSchema,
  label: z.string().min(1),
  sentAt: z.string().datetime(),
  deliveryState: debugDmInboxDeliveryStateSchema,
  preview: debugDmPreviewSchema,
  revisions: z.array(debugDmInboxMessageRevisionSchema).min(1)
})

export const debugDmInboxParticipantSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
    timezoneId: timezoneIdSchema
  }),
  role: debugDmInboxRoleSchema,
  lastActivityAt: z.string().datetime().nullable(),
  messages: z.array(debugDmInboxMessageSchema)
})

export const debugPlayIntentSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  windowStartsAt: z.string().datetime(),
  windowEndsAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: debugPlayIntentStatusSchema,
  headline: z.string().min(1),
  note: z.string(),
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  gameTitles: z.array(z.string().min(1)),
  platformLabels: z.array(platformLabelSchema),
  targetedFriendCount: z.number().int().nonnegative(),
  notificationCount: z.number().int().nonnegative(),
  deliveredNotificationCount: z.number().int().nonnegative(),
  respondedNotificationCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  creator: z.object({
    id: z.string().uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
    timezoneId: timezoneIdSchema
  }),
  creatorDmPreview: debugDmPreviewSchema.nullable(),
  dmInboxParticipants: z.array(debugDmInboxParticipantSchema)
})

export const debugDmActionRequestSchema = z.object({
  actingUserId: z.string().uuid(),
  customId: z.string().min(1)
})

export const debugDmTemplateSendRequestSchema = z.object({
  templateId: z.string().min(1)
})

export const debugDmActionResponseSchema = z.object({
  message: z.string().min(1)
})

export const debugPlayIntentLifecycleEventSourceSchema = z.enum(['play-intent', 'notification', 'auto-play-prompt', 'system'])

export const debugPlayIntentLifecycleEventSchema = z.object({
  id: z.string().min(1),
  playIntentId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  source: debugPlayIntentLifecycleEventSourceSchema,
  eventType: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().nullable(),
  isError: z.boolean(),
  notificationId: z.string().uuid().nullable(),
  promptId: z.string().uuid().nullable(),
  actorDisplayName: z.string().min(1).nullable(),
  recipientDisplayName: z.string().min(1).nullable()
})

export const debugErrorLogSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  source: debugPlayIntentLifecycleEventSourceSchema,
  message: z.string().min(1),
  detail: z.string().nullable(),
  playIntentId: z.string().uuid().nullable(),
  notificationId: z.string().uuid().nullable(),
  promptId: z.string().uuid().nullable()
})

export const debugAdminResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  bot: debugDiscordBotStateSchema,
  dmTemplates: z.array(debugDmTemplateGroupSchema),
  recentAutoPlayPrompts: z.array(debugAutoPlayPromptSchema),
  recentInviteAttributions: z.array(debugInviteAttributionSchema),
  recentNotifications: z.array(debugNotificationDeliverySchema),
  recentPlayIntents: z.array(debugPlayIntentSummarySchema),
  playIntentLifecycleEvents: z.array(debugPlayIntentLifecycleEventSchema),
  recentErrors: z.array(debugErrorLogSchema)
})

export const userPlatformAliasSchema = z.object({
  id: z.string().uuid(),
  platform: z.string().min(1).max(32),
  aliasValue: z.string().min(1).max(80)
})

export const userPlatformAliasesResponseSchema = z.object({
  aliases: z.array(userPlatformAliasSchema)
})

export const upsertUserPlatformAliasRequestSchema = z.object({
  aliasValue: z.string().trim().min(1).max(80)
})

export const userGameAliasSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  gameTitle: z.string().min(1),
  aliasValue: z.string().min(1).max(80)
})

export const userGameAliasesResponseSchema = z.object({
  aliases: z.array(userGameAliasSchema)
})

export const upsertUserGameAliasRequestSchema = z.object({
  aliasValue: z.string().trim().min(1).max(80)
})

export const playIntentMuteSchema = z.object({
  mutedUserId: z.string().uuid(),
  mutedUserDisplayName: z.string().min(1),
  mutedUserHandle: z.string().min(1),
  mutedUserAvatarUrl: z.string().url().nullable()
})

export const playIntentMutesResponseSchema = z.object({
  mutes: z.array(playIntentMuteSchema)
})

export const clientBootstrapSchema = z.object({
  appName: z.string(),
  apiBaseUrl: z.string().url(),
  features: z.object({
    pushNotifications: z.boolean(),
    multiGamePlayIntent: z.boolean()
  })
})

export const dashboardInvalidationDomainSchema = z.enum([
  'auth',
  'profile',
  'library',
  'network',
  'discovery',
  'play-intents'
])

export const dashboardInvalidationEventSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  domains: z.array(dashboardInvalidationDomainSchema).min(1)
})

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_CALLBACK_URL: z.string().url().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_BOT_MODE: discordBotModeSchema.optional(),
  DISCORD_SERVER_ID: z.string().optional(),
  DISCORD_SEND_REAL_DMS_IN_DEV: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  STEAM_CALLBACK_URL: z.string().url().optional(),
  STEAM_WEB_API_KEY: z.string().optional(),
  RAWG_API_KEY: z.string().optional(),
  ADMIN_HANDLES: z.string().optional()
})

export type AuthProvider = z.infer<typeof authProviderSchema>;
export type PlatformLabel = z.infer<typeof platformLabelSchema>;
export type CatalogProvider = z.infer<typeof catalogProviderSchema>;
export type AvailabilitySource = z.infer<typeof availabilitySourceSchema>;
export type CatalogGameMatch = z.infer<typeof catalogGameMatchSchema>;
export type LibraryEntryIntent = z.infer<typeof libraryEntryIntentSchema>;
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export type LibrarySuggestedGame = z.infer<typeof librarySuggestedGameSchema>;
export type LibraryTrendingGame = z.infer<typeof libraryTrendingGameSchema>;
export type LibraryResponse = z.infer<typeof libraryResponseSchema>;
export type SteamLibraryImportStatus = z.infer<typeof steamLibraryImportStatusSchema>;
export type SteamLibraryImportGame = z.infer<typeof steamLibraryImportGameSchema>;
export type SteamLibraryImportAccount = z.infer<typeof steamLibraryImportAccountSchema>;
export type SteamLibraryImportPreviewResponse = z.infer<typeof steamLibraryImportPreviewResponseSchema>;
export type SteamLinkIntentResponse = z.infer<typeof steamLinkIntentResponseSchema>;
export type SteamLibraryImportSelection = z.infer<typeof steamLibraryImportSelectionSchema>;
export type ImportSteamLibrarySelectionRequest = z.infer<typeof importSteamLibrarySelectionRequestSchema>;
export type GameSearchResult = z.infer<typeof gameSearchResultSchema>;
export type GameSearchResponse = z.infer<typeof gameSearchResponseSchema>;
export type DiscordServerPreference = z.infer<typeof discordServerPreferenceSchema>;
export type DiscordServerPreferencesResponse = z.infer<typeof discordServerPreferencesResponseSchema>;
export type DiscordServerMember = z.infer<typeof discordServerMemberSchema>;
export type DiscordServerMembersResponse = z.infer<typeof discordServerMembersResponseSchema>;
export type DiscordVoiceChannel = z.infer<typeof discordVoiceChannelSchema>;
export type DiscordVoiceChannelsResponse = z.infer<typeof discordVoiceChannelsResponseSchema>;
export type PlayIntentTargetDiscordServer = z.infer<typeof playIntentTargetDiscordServerSchema>;
export type SendDiscordServerInvitesRequest = z.infer<typeof sendDiscordServerInvitesRequestSchema>;
export type SendDiscordServerInvitesResult = z.infer<typeof sendDiscordServerInvitesResultSchema>;
export type SendDiscordServerInvitesResponse = z.infer<typeof sendDiscordServerInvitesResponseSchema>;
export type UpdateDiscordServerPreferenceRequest = z.infer<typeof updateDiscordServerPreferenceRequestSchema>;
export type UpsertLibraryEntryRequest = z.infer<typeof upsertLibraryEntryRequestSchema>;
export type DiscoveryPersonGame = z.infer<typeof discoveryPersonGameSchema>;
export type DiscoveryPerson = z.infer<typeof discoveryPersonSchema>;
export type DiscoveryGamePlayer = z.infer<typeof discoveryGamePlayerSchema>;
export type DiscoveryGame = z.infer<typeof discoveryGameSchema>;
export type DiscoveryFeed = z.infer<typeof discoveryFeedSchema>;
export type PlayIntentSelectionMode = z.infer<typeof playIntentSelectionModeSchema>;
export type PlayIntentNotifyScope = z.infer<typeof playIntentNotifyScopeSchema>;
export type PlayIntentDiscordSpaceStatus = z.infer<typeof playIntentDiscordSpaceStatusSchema>;
export type PlayIntentDiscordSpace = z.infer<typeof playIntentDiscordSpaceSchema>;
export type PlayIntentPreview = z.infer<typeof playIntentPreviewSchema>;
export type PlayIntentExpandedGame = z.infer<typeof playIntentExpandedGameSchema>;
export type PlayIntentExpandedGameScope = z.infer<typeof playIntentExpandedGameScopeSchema>;
export type PlayIntentDetail = z.infer<typeof playIntentDetailSchema>;
export type PlayIntentFeed = z.infer<typeof playIntentFeedSchema>;
export type PlayIntentDetailResponse = z.infer<typeof playIntentDetailResponseSchema>;
export type ActivePlayIntent = z.infer<typeof activePlayIntentSchema>;
export type PlayIntentCurrentResponse = z.infer<typeof playIntentCurrentResponseSchema>;
export type PlayIntentRecipientResponseChoice = z.infer<typeof playIntentRecipientResponseChoiceSchema>;
export type PlayIntentRecipientResponseRequest = z.infer<typeof playIntentRecipientResponseRequestSchema>;
export type PlayIntentRecipientResponseResult = z.infer<typeof playIntentRecipientResponseResultSchema>;
export type PlayIntentDiscordSpaceRetryResponse = z.infer<typeof playIntentDiscordSpaceRetryResponseSchema>;
export type UpsertPlayIntentRequest = z.infer<typeof upsertPlayIntentRequestSchema>;
export type UpsertPlayIntentResponse = z.infer<typeof upsertPlayIntentResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type AuthProvidersResponse = z.infer<typeof authProvidersResponseSchema>;
export type DiscordGraphCapabilities = z.infer<typeof discordGraphCapabilitiesSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileRequestSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
export type DebugDiscordBotState = z.infer<typeof debugDiscordBotStateSchema>;
export type DebugAutoPlayPromptStatus = z.infer<typeof debugAutoPlayPromptStatusSchema>;
export type DebugDmPreviewButtonStyle = z.infer<typeof debugDmPreviewButtonStyleSchema>;
export type DebugDmPreviewButton = z.infer<typeof debugDmPreviewButtonSchema>;
export type DebugDmPreview = z.infer<typeof debugDmPreviewSchema>;
export type DebugDmTemplateEntry = z.infer<typeof debugDmTemplateEntrySchema>;
export type DebugDmTemplateGroup = z.infer<typeof debugDmTemplateGroupSchema>;
export type DebugDmInboxRole = z.infer<typeof debugDmInboxRoleSchema>;
export type DebugDmInboxDeliveryState = z.infer<typeof debugDmInboxDeliveryStateSchema>;
export type DebugDmInboxMessageKind = z.infer<typeof debugDmInboxMessageKindSchema>;
export type DebugDmInboxMessageRevision = z.infer<typeof debugDmInboxMessageRevisionSchema>;
export type DebugDmInboxMessage = z.infer<typeof debugDmInboxMessageSchema>;
export type DebugDmInboxParticipant = z.infer<typeof debugDmInboxParticipantSchema>;
export type DebugDmActionRequest = z.infer<typeof debugDmActionRequestSchema>;
export type DebugDmTemplateSendRequest = z.infer<typeof debugDmTemplateSendRequestSchema>;
export type DebugDmActionResponse = z.infer<typeof debugDmActionResponseSchema>;
export type DebugAutoPlayPrompt = z.infer<typeof debugAutoPlayPromptSchema>;
export type DebugInviteAttribution = z.infer<typeof debugInviteAttributionSchema>;
export type DebugNotificationDelivery = z.infer<typeof debugNotificationDeliverySchema>;
export type DebugPlayIntentStatus = z.infer<typeof debugPlayIntentStatusSchema>;
export type DebugPlayIntentSummary = z.infer<typeof debugPlayIntentSummarySchema>;
export type DebugPlayIntentLifecycleEventSource = z.infer<typeof debugPlayIntentLifecycleEventSourceSchema>;
export type DebugPlayIntentLifecycleEvent = z.infer<typeof debugPlayIntentLifecycleEventSchema>;
export type DebugErrorLog = z.infer<typeof debugErrorLogSchema>;
export type DebugAdminResponse = z.infer<typeof debugAdminResponseSchema>;
export type ClientBootstrap = z.infer<typeof clientBootstrapSchema>;
export type DashboardInvalidationDomain = z.infer<typeof dashboardInvalidationDomainSchema>;
export type DashboardInvalidationEvent = z.infer<typeof dashboardInvalidationEventSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type UserPlatformAlias = z.infer<typeof userPlatformAliasSchema>;
export type UserPlatformAliasesResponse = z.infer<typeof userPlatformAliasesResponseSchema>;
export type UpsertUserPlatformAliasRequest = z.infer<typeof upsertUserPlatformAliasRequestSchema>;
export type UserGameAlias = z.infer<typeof userGameAliasSchema>;
export type UserGameAliasesResponse = z.infer<typeof userGameAliasesResponseSchema>;
export type UpsertUserGameAliasRequest = z.infer<typeof upsertUserGameAliasRequestSchema>;
export type PlayIntentMute = z.infer<typeof playIntentMuteSchema>;
export type PlayIntentMutesResponse = z.infer<typeof playIntentMutesResponseSchema>;

export * from './dateTime'