import { z } from 'zod'

export const authProviderSchema = z.enum(['discord', 'steam'])
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

export const libraryResponseSchema = z.object({
  usualAvailability: z.string().nullable(),
  entries: z.array(libraryEntrySchema),
  suggestedGames: z.array(librarySuggestedGameSchema).default([])
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
export const playIntentNotifyScopeSchema = z.enum(['network', 'friends-only', 'specific-friends'])

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
  user: playIntentPreviewUserSchema,
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  platforms: z.array(z.string()).min(1),
  games: z.array(playIntentGameSchema),
  note: z.string().max(140),
  availabilityWindow: availabilityWindowSchema
})

export const playIntentFeedSchema = z.object({
  generatedAt: z.string().datetime(),
  intents: z.array(playIntentPreviewSchema)
})

export const activePlayIntentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  targetedFriends: z.array(playIntentPreviewUserSchema),
  platforms: z.array(platformLabelSchema).min(1),
  games: z.array(playIntentGameSchema),
  note: z.string().max(140),
  windowStartsAt: z.string().datetime(),
  windowEndsAt: z.string().datetime(),
  expiresAt: z.string().datetime()
})

export const playIntentCurrentResponseSchema = z.object({
  activeIntent: activePlayIntentSchema.nullable()
})

export const upsertPlayIntentRequestSchema = z.object({
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  note: z.string().trim().max(140).optional(),
  startAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(1440).optional(),
  endAt: z.string().datetime().optional(),
  gameIds: z.array(z.string().uuid()).default([]),
  targetUserIds: z.array(z.string().uuid()).max(25).default([])
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
  bio: z.string().max(280),
  timezoneId: timezoneIdSchema,
  timezoneLabel: z.string().min(2).max(24),
  usualAvailability: z.string().nullable(),
  mutualServers: z.array(z.string().min(1)),
  games: z.array(discoveryPersonGameSchema),
  discordActivity: z.object({
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
  authProvider: authProviderSchema
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
  connectedProviders: z.array(authProviderSchema).default([])
})

export const debugDiscordBotStateSchema = z.object({
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
  })
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
  }).nullable()
})

export const debugAdminResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  bot: debugDiscordBotStateSchema,
  recentAutoPlayPrompts: z.array(debugAutoPlayPromptSchema),
  recentNotifications: z.array(debugNotificationDeliverySchema)
})

export const clientBootstrapSchema = z.object({
  appName: z.string(),
  apiBaseUrl: z.string().url(),
  features: z.object({
    pushNotifications: z.boolean(),
    androidWrapper: z.boolean(),
    multiGamePlayIntent: z.boolean()
  })
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
  STEAM_CALLBACK_URL: z.string().url().optional(),
  STEAM_WEB_API_KEY: z.string().optional(),
  RAWG_API_KEY: z.string().optional(),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional()
})

export type AuthProvider = z.infer<typeof authProviderSchema>;
export type PlatformLabel = z.infer<typeof platformLabelSchema>;
export type CatalogProvider = z.infer<typeof catalogProviderSchema>;
export type AvailabilitySource = z.infer<typeof availabilitySourceSchema>;
export type CatalogGameMatch = z.infer<typeof catalogGameMatchSchema>;
export type LibraryEntryIntent = z.infer<typeof libraryEntryIntentSchema>;
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export type LibrarySuggestedGame = z.infer<typeof librarySuggestedGameSchema>;
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
export type PlayIntentPreview = z.infer<typeof playIntentPreviewSchema>;
export type PlayIntentFeed = z.infer<typeof playIntentFeedSchema>;
export type ActivePlayIntent = z.infer<typeof activePlayIntentSchema>;
export type PlayIntentCurrentResponse = z.infer<typeof playIntentCurrentResponseSchema>;
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
export type DebugAutoPlayPrompt = z.infer<typeof debugAutoPlayPromptSchema>;
export type DebugNotificationDelivery = z.infer<typeof debugNotificationDeliverySchema>;
export type DebugAdminResponse = z.infer<typeof debugAdminResponseSchema>;
export type ClientBootstrap = z.infer<typeof clientBootstrapSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;