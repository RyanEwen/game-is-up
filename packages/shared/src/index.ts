import { z } from 'zod'

export const authProviderSchema = z.enum(['discord'])
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

export const libraryResponseSchema = z.object({
  usualAvailability: z.string().nullable(),
  entries: z.array(libraryEntrySchema)
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
export const playIntentNotifyScopeSchema = z.enum(['discovery-and-friends', 'friends-only'])

export const playIntentGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  platform: z.string().min(1)
})

export const playIntentPreviewSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
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
  durationMinutes: z.number().int().min(15).max(1440).optional(),
  endAt: z.string().datetime().optional(),
  gameIds: z.array(z.string().uuid()).default([])
}).superRefine((value, context) => {
  if ((value.durationMinutes == null) === (value.endAt == null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either a duration or an end time for the play intent.',
      path: ['durationMinutes']
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
    requestedScopes: z.array(z.string().min(1)),
    gatedScopes: z.array(z.string().min(1)),
    installUrl: z.string().url().nullable().optional()
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
  relationshipSync: z.object({
    available: z.boolean(),
    requiresApproval: z.boolean(),
    status: z.enum(['approval-required', 'scope-missing', 'ready', 'synced', 'error']),
    lastSyncedAt: z.string().datetime().nullable(),
    error: z.string().nullable()
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
  authProvider: authProviderSchema
})

export const userProfileSchema = z.object({
  timezoneId: timezoneIdSchema,
  usualAvailability: z.string().nullable()
})

export const userProfileResponseSchema = userProfileSchema

export const updateUserProfileRequestSchema = z.object({
  timezoneId: timezoneIdSchema.optional(),
  usualAvailability: z.string().trim().max(80).optional()
})

export const authSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: authenticatedUserSchema.nullable(),
  discordGraph: discordGraphCapabilitiesSchema.nullable()
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
export type LibraryResponse = z.infer<typeof libraryResponseSchema>;
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
export type ClientBootstrap = z.infer<typeof clientBootstrapSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;