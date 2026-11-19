/**
 * Shared HTTP, SSE, and serialization contracts for Game's Up.
 *
 * Both the Express API and the Vite web app import from this module to keep
 * request/response shapes in lock-step. The schemas below are organized into
 * thematic sections (auth, library, Steam import, game catalog, Discord
 * servers, play intents, discovery, debug, dashboard SSE, server env, aliases,
 * mutes) followed by a single block of inferred TypeScript types and
 * re-exports for the supporting submodules. See `ARCHITECTURE.md` for the
 * higher-level product context behind these shapes.
 *
 * When adding a schema, prefer adding it inside the section it belongs to
 * rather than appending to the bottom of the file, and define the matching
 * `export type Foo = z.infer<typeof fooSchema>` next to the existing type
 * block so the contract surface stays scannable.
 */

// First: configures zod before any schema below (or in the modules they import) is created.
import './validation-config.js'
import { z } from 'zod'
import { runningLateMinutesSchema } from './running-late.js'
export {
  runningLateMinutesSchema,
  parseRunningLateMinutes,
  formatRunningLateLabel,
} from './running-late.js'

// ---------------------------------------------------------------------------
// Identity, auth, and shared primitives
// ---------------------------------------------------------------------------

export const authProviderSchema = z.enum(['discord', 'steam'])
export const discordBotModeSchema = z.enum(['off', 'rest', 'gateway'])
export const platformLabelSchema = z.string().trim().min(1).max(32)
export const catalogProviderSchema = z.string().trim().min(1).max(32)
export const availabilitySourceSchema = z.enum([
  'profile-default',
  'game-specific',
])
export const timezoneIdSchema = z.string().trim().min(1).max(64)

export const availabilityWindowSchema = z.object({
  label: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
})

export const libraryEntryIntentSchema = z.enum([
  'wishlist',
  'interested',
  'playing-now',
])

// ---------------------------------------------------------------------------
// Game catalog match + library entries
// ---------------------------------------------------------------------------

export const catalogGameMatchSchema = z.object({
  source: catalogProviderSchema,
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().trim().min(1).max(120),
  coverUrl: z.url().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  platformLabels: z.array(platformLabelSchema).default([]),
})

export const libraryEntrySchema = z.object({
  id: z.uuid(),
  gameId: z.uuid(),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: libraryEntryIntentSchema,
  availability: z.string().nullable(),
  availabilitySource: availabilitySourceSchema.nullable(),
})

export const librarySuggestedGameSchema = z.object({
  gameId: z.uuid(),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  lastObservedAt: z.iso.datetime(),
  sourceServerName: z.string().min(1).nullable(),
})

export const libraryTrendingGameSchema = z.object({
  gameId: z.uuid(),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  recentPlayerCount: z.number().int().positive(),
  alreadyInLibrary: z.boolean(),
})

export const libraryResponseSchema = z.object({
  usualAvailability: z.string().nullable(),
  entries: z.array(libraryEntrySchema),
  suggestedGames: z.array(librarySuggestedGameSchema).default([]),
  trendingGames: z.array(libraryTrendingGameSchema).default([]),
})

export const steamLibraryImportStatusSchema = z.enum([
  'not-linked',
  'ready',
  'unavailable',
])

// ---------------------------------------------------------------------------
// Steam library import flow
// ---------------------------------------------------------------------------

export const steamLibraryImportGameSchema = z.object({
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  minutesPlayedTotal: z.number().int().nonnegative(),
  minutesPlayedRecent: z.number().int().nonnegative(),
  alreadyInLibrary: z.boolean(),
  gameplayClassification: z
    .enum(['singleplayer-only', 'multiplayer', 'unknown'])
    .default('unknown'),
})

export const steamLibraryImportAccountSchema = z.object({
  steamId: z.string().trim().min(1).max(32),
  displayName: z.string().trim().min(1).max(120),
  avatarUrl: z.url().nullable(),
  profileUrl: z.url().nullable(),
})

export * from './play-intent-update-effects.js'
export * from './debug-dm-simulator-state.js'
export * from './debug-dm-simulator-history.js'
export * from './discord-formatting.js'

export const steamLibraryImportPreviewResponseSchema = z.object({
  status: steamLibraryImportStatusSchema,
  note: z.string().nullable(),
  account: steamLibraryImportAccountSchema.nullable(),
  games: z.array(steamLibraryImportGameSchema).default([]),
})

export const steamLinkIntentResponseSchema = z.object({
  authorizationUrl: z.url(),
})

export const steamLibraryImportSelectionSchema = z.object({
  sourceId: z.string().trim().min(1).max(96),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: libraryEntryIntentSchema,
  availability: z.string().trim().max(80).optional(),
})

export const importSteamLibrarySelectionRequestSchema = z.object({
  games: z.array(steamLibraryImportSelectionSchema).min(1).max(500),
})

export const gameSearchResultSchema = z.object({
  id: z.string().min(1),
  source: catalogProviderSchema,
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema),
  gameplayClassification: z
    .enum(['singleplayer-only', 'multiplayer', 'unknown'])
    .default('unknown'),
})

export const gameSearchResponseSchema = z.object({
  results: z.array(gameSearchResultSchema),
})

export const gameDetailsClassificationSchema = z.enum([
  'singleplayer-only',
  'multiplayer',
  'unknown',
])

export const gameDetailsGameplaySchema = z.object({
  classification: gameDetailsClassificationSchema,
  isSinglePlayer: z.boolean(),
  isMultiplayer: z.boolean(),
  isCoOp: z.boolean(),
  evidence: z.array(z.string().trim().min(1).max(64)).default([]),
})

export const gameDetailsMediaItemSchema = z.object({
  kind: z.enum(['image', 'video']),
  url: z.url(),
  thumbnailUrl: z.url().nullable(),
  label: z.string().trim().min(1).max(120).nullable(),
})

export const gameDetailsStoreLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.url(),
})

export const gameDetailsSchema = z.object({
  id: z.string().min(1),
  source: catalogProviderSchema,
  sourceId: z.string().trim().min(1).max(96),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  heroImageUrl: z.url().nullable(),
  description: z.string().trim().max(12000).nullable(),
  shortDescription: z.string().trim().max(1200).nullable(),
  websiteUrl: z.url().nullable(),
  releasedAt: z.string().date().nullable(),
  developers: z.array(z.string().trim().min(1).max(120)).default([]),
  publishers: z.array(z.string().trim().min(1).max(120)).default([]),
  genres: z.array(z.string().trim().min(1).max(64)).default([]),
  tags: z.array(z.string().trim().min(1).max(64)).default([]),
  platformLabels: z.array(platformLabelSchema).default([]),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  metacritic: z.number().int().min(0).max(100).nullable(),
  gameplay: gameDetailsGameplaySchema,
  storeLinks: z.array(gameDetailsStoreLinkSchema).default([]),
  media: z.array(gameDetailsMediaItemSchema).default([]),
})

export const gameDetailsResponseSchema = z.object({
  game: gameDetailsSchema.nullable(),
})

export const discordServerPreferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.url().nullable(),
  botPresent: z.boolean(),
  selected: z.boolean(),
  knownUserCount: z.number().int().nonnegative(),
})

export const discordServerPreferencesResponseSchema = z.object({
  servers: z.array(discordServerPreferenceSchema),
})

export const discordServerMemberSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  profileDisplayName: z.string().min(1),
  avatarUrl: z.url().nullable(),
  isAppUser: z.boolean(),
  appUserId: z.uuid().nullable(),
  appDisplayName: z.string().min(1).nullable(),
  appHandle: z.string().min(1).nullable(),
})

export const discordServerMembersResponseSchema = z.object({
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  members: z.array(discordServerMemberSchema),
})

export const discordVoiceChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  serverIconUrl: z.url().nullable(),
})

export const discordVoiceChannelsResponseSchema = z.object({
  channels: z.array(discordVoiceChannelSchema),
})

export const playIntentTargetDiscordServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.url().nullable(),
})

export const sendDiscordServerInvitesRequestSchema = z.object({
  inviteUrl: z.url(),
  memberIds: z.array(z.string().min(1)).min(1).max(25),
})

export const sendDiscordServerInvitesResultSchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  username: z.string().min(1),
  status: z.enum(['sent', 'failed']),
  error: z.string().min(1).nullable(),
})

export const sendDiscordServerInvitesResponseSchema = z.object({
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  results: z.array(sendDiscordServerInvitesResultSchema),
})

export const updateDiscordServerPreferenceRequestSchema = z.object({
  selected: z.boolean(),
})

export const upsertLibraryEntryRequestSchema = z.object({
  title: z.string().trim().min(1).max(80),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: libraryEntryIntentSchema,
  availability: z.string().trim().max(80).optional(),
  catalogMatch: catalogGameMatchSchema.optional(),
})

// ---------------------------------------------------------------------------
// Play intents (composer, audience, scheduling, Discord-space provisioning)
// ---------------------------------------------------------------------------

export const playIntentSelectionModeSchema = z.enum(['library', 'subset'])
export const playIntentNotifyScopeSchema = z.enum([
  'network',
  'friends-only',
  'specific-friends',
  'friends-list',
  'specific-discord-server',
])
export const maximumPlayIntentGameSelectionCount = 5

export const playIntentDiscordSpaceStatusSchema = z.enum([
  'requested',
  'provisioning',
  'active',
  'retained',
  'delete-requested',
  'deleted',
  'provision-failed',
])

export const playIntentDiscordSpaceSchema = z.object({
  status: playIntentDiscordSpaceStatusSchema,
  serverId: z.string().min(1),
  categoryChannelName: z.string().min(1).nullable(),
  textChannelName: z.string().min(1).nullable(),
  textChannelUrl: z.url().nullable(),
  voiceChannelName: z.string().min(1).nullable(),
  voiceChannelUrl: z.url().nullable(),
  inviteUrl: z.url().nullable(),
  deleteAfter: z.iso.datetime().nullable(),
  lastSyncError: z.string().min(1).nullable().default(null),
})

export const playIntentGameSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  platform: z.string().min(1),
  coverUrl: z.url().nullable(),
})

export const playIntentPreviewUserSchema = z.object({
  id: z.uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.url().nullable(),
})

/**
 * An interested recipient, optionally flagged as running late. `runningLate`
 * only applies to interested users, so it lives on this extension rather than
 * the generic preview-user shape used for creators, passed, and targeted users.
 */
export const playIntentInterestedUserSchema =
  playIntentPreviewUserSchema.extend({
    runningLate: z.boolean().default(false),
    runningLateMinutes: runningLateMinutesSchema.optional(),
  })

export const playIntentPreviewSchema = z.object({
  allowParticipantInvites: z.boolean().default(true),
  id: z.uuid(),
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
  /** True when the viewer marked interested and then flagged they will be late. */
  viewerRunningLate: z.boolean().default(false),
  viewerRunningLateMinutes: runningLateMinutesSchema.optional(),
  interestedUsers: z.array(playIntentInterestedUserSchema).default([]),
  interestedCount: z.number().int().min(0),
  availabilityWindow: availabilityWindowSchema,
})

export const playIntentExpandedGameSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
})

export const playIntentExpandedGameScopeSchema = z.object({
  kind: z.enum(['creator-library', 'shared-library']),
  title: z.string().min(1),
  description: z.string().min(1),
  totalCount: z.number().int().min(0),
  games: z.array(playIntentExpandedGameSchema).default([]),
  nonOverlappingGames: z.array(playIntentExpandedGameSchema).default([]),
})

export const playIntentDetailSchema = playIntentPreviewSchema.extend({
  createdAt: z.iso.datetime(),
  audienceSummary: z.string().min(1),
  passedUsers: z.array(playIntentPreviewUserSchema).default([]),
  targetedFriends: z.array(playIntentPreviewUserSchema).default([]),
  targetFriendsListId: z.uuid().nullable().default(null),
  expandedGameScope: playIntentExpandedGameScopeSchema.nullable().default(null),
})

export const playIntentFeedSchema = z.object({
  generatedAt: z.iso.datetime(),
  intents: z.array(playIntentPreviewSchema),
})

/** A participant invitation always targets exactly one existing friend. */
export const playIntentFriendInviteRequestSchema = z.strictObject({
  friendUserId: z.uuid(),
})

export const playIntentInvitableFriendsResponseSchema = z.object({
  friends: z.array(playIntentPreviewUserSchema),
})

export const playIntentFriendInviteResponseSchema = z.object({
  invited: z.boolean(),
  message: z.string().min(1),
})

export const playIntentDetailResponseSchema = z.object({
  intent: playIntentDetailSchema,
})

export const activePlayIntentSchema = z.object({
  allowParticipantInvites: z.boolean().default(true),
  id: z.uuid(),
  title: z.string().min(1),
  selectionMode: playIntentSelectionModeSchema,
  notifyScope: playIntentNotifyScopeSchema,
  targetServers: z.array(playIntentTargetDiscordServerSchema).default([]),
  targetedFriends: z.array(playIntentPreviewUserSchema),
  targetFriendsListId: z.uuid().nullable().default(null),
  platforms: z.array(platformLabelSchema).min(1),
  games: z.array(playIntentGameSchema),
  note: z.string().max(140),
  voiceChannelId: z.string().min(1).nullable(),
  voiceChannelName: z.string().min(1).nullable(),
  discordSpace: playIntentDiscordSpaceSchema.nullable().default(null),
  windowStartsAt: z.iso.datetime(),
  windowEndsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  interestedUsers: z.array(playIntentInterestedUserSchema).default([]),
  interestedCount: z.number().int().min(0),
})

export const playIntentCurrentResponseSchema = z.object({
  activeIntent: activePlayIntentSchema.nullable(),
})

export const playIntentRecipientResponseChoiceSchema = z.enum([
  'interested',
  'pass',
])

/**
 * Actions a recipient can take from a call-to-play prompt. `late` is a modifier
 * on an existing `interested` response (saying "I'll be late") rather than a
 * distinct response state, so it never replaces the stored interested/pass choice.
 */
export const playIntentRecipientActionSchema = z.enum([
  'interested',
  'pass',
  'late',
])

export const playIntentRecipientResponseRequestSchema = z
  .object({
    // Keep the older Discord-style aliases compatible at the HTTP boundary.
    choice: z
      .enum(['interested', 'pass', 'late', 'join', 'decline'])
      .transform((choice) => {
        if (choice === 'join') {
          return 'interested' as const
        }
        if (choice === 'decline') {
          return 'pass' as const
        }
        return choice
      }),
    runningLateMinutes: runningLateMinutesSchema.optional(),
  })
  .superRefine((response, context) => {
    if (response.choice !== 'late' && response.runningLateMinutes != null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runningLateMinutes'],
        message: 'A delay estimate only applies to a running-late response.',
      })
    }
  })

export const playIntentRecipientResponseResultSchema = z.object({
  responseChoice: playIntentRecipientActionSchema,
  message: z.string().min(1),
})

export const playIntentDiscordSpaceDeleteResponseSchema = z.object({
  status: z.enum(['deleted', 'missing']),
  message: z.string().min(1),
})

export const playIntentDiscordSpaceRetryResponseSchema = z.object({
  status: z.enum(['retrying', 'missing']),
  message: z.string().min(1),
})

/**
 * Composer payload used to create or edit a call to play. The `superRefine`
 * block enforces the inter-field rules that pure shape validation cannot:
 *
 * - Exactly one of `durationMinutes` or `endAt` must be provided.
 * - `targetUserIds` is required for and exclusive to the `specific-friends`
 *   audience scope.
 * - `targetFriendsListId` is required for and exclusive to the `friends-list`
 *   audience scope.
 * - `targetDiscordServerIds` is required for and exclusive to the
 *   `specific-discord-server` audience scope.
 * - New or edited calls to play must target a selected subset of 1 to 5
 *   games from the creator's library.
 * - A temporary Discord space (`createDiscordSpace`) and an existing voice
 *   channel selection are mutually exclusive.
 * - Voice channel id and name must be provided together or not at all.
 */
export const upsertPlayIntentRequestSchema = z
  .object({
    playIntentId: z.uuid().optional(),
    title: z.string().trim().max(80).optional(),
    selectionMode: z.literal('subset'),
    notifyScope: playIntentNotifyScopeSchema,
    includeSelf: z.boolean().optional().default(false),
    createDiscordSpace: z.boolean().optional().default(false),
    allowParticipantInvites: z.boolean().optional(),
    note: z.string().trim().max(140).optional(),
    voiceChannelId: z.string().trim().min(1).max(32).optional(),
    voiceChannelName: z.string().trim().min(1).max(100).optional(),
    startAt: z.iso.datetime().optional(),
    durationMinutes: z.number().int().min(15).max(1440).optional(),
    endAt: z.iso.datetime().optional(),
    gameIds: z.array(z.uuid()).min(1).max(maximumPlayIntentGameSelectionCount),
    targetUserIds: z.array(z.uuid()).max(25).default([]),
    targetFriendsListId: z.uuid().optional(),
    targetDiscordServerIds: z
      .array(z.string().trim().min(1).max(64))
      .max(25)
      .default([]),
  })
  .superRefine((value, context) => {
    if ((value.durationMinutes == null) === (value.endAt == null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either a duration or an end time for the play intent.',
        path: ['durationMinutes'],
      })
    }

    if (
      value.notifyScope === 'specific-friends' &&
      value.targetUserIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Choose at least one friend for a specific-friends call to play.',
        path: ['targetUserIds'],
      })
    }

    if (
      value.notifyScope !== 'specific-friends' &&
      value.targetUserIds.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Specific target friends are only valid for the specific-friends audience.',
        path: ['targetUserIds'],
      })
    }

    if (
      value.notifyScope === 'friends-list' &&
      value.targetFriendsListId == null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a friends list for a friends-list call to play.',
        path: ['targetFriendsListId'],
      })
    }

    if (
      value.notifyScope !== 'friends-list' &&
      value.targetFriendsListId != null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A friends list is only valid for the friends-list audience.',
        path: ['targetFriendsListId'],
      })
    }

    if (
      value.notifyScope === 'specific-discord-server' &&
      value.targetDiscordServerIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Choose at least one Discord server for a specific Discord server call to play.',
        path: ['targetDiscordServerIds'],
      })
    }

    if (
      value.notifyScope !== 'specific-discord-server' &&
      value.targetDiscordServerIds.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Target Discord servers are only valid for the specific Discord server audience.',
        path: ['targetDiscordServerIds'],
      })
    }

    if (
      value.createDiscordSpace &&
      (value.voiceChannelId || value.voiceChannelName)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Choose either an existing voice channel or a temporary Discord channel.',
        path: ['voiceChannelId'],
      })
    }

    if ((value.voiceChannelId == null) !== (value.voiceChannelName == null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Voice channel selections must include both the channel id and name.',
        path: ['voiceChannelId'],
      })
    }
  })

export const upsertPlayIntentResponseSchema = z.object({
  activeIntent: activePlayIntentSchema,
  notifiedFriendCount: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// Friends lists (reusable named audiences for calls to play)
// ---------------------------------------------------------------------------

export const maximumFriendsListMemberCount = 100

export const friendsListSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  memberCount: z.number().int().nonnegative(),
  members: z.array(playIntentPreviewUserSchema).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const friendsListsResponseSchema = z.object({
  lists: z.array(friendsListSchema).default([]),
})

export const friendsListResponseSchema = z.object({
  list: friendsListSchema,
})

export const upsertFriendsListRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  friendUserIds: z.array(z.uuid()).min(1).max(maximumFriendsListMemberCount),
})

export const deleteFriendsListResponseSchema = z.object({
  status: z.enum(['deleted', 'missing']),
  message: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Discovery feed
// ---------------------------------------------------------------------------

export const discoveryPersonGameSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: z.enum(['wishlist', 'interested', 'playing-now']),
  availability: z.string().nullable(),
  availabilitySource: availabilitySourceSchema.nullable(),
})

export const discoveryPersonSchema = z.object({
  id: z.uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.url().nullable(),
  discordUserId: z.string().min(1).nullable(),
  bio: z.string().max(280),
  timezoneId: timezoneIdSchema,
  timezoneLabel: z.string().min(2).max(24),
  usualAvailability: z.string().nullable(),
  mutualServerIds: z.array(z.string().min(1)),
  mutualServers: z.array(z.string().min(1)),
  games: z.array(discoveryPersonGameSchema),
  discordActivity: z
    .object({
      title: z.string().min(1),
      applicationId: z.string().nullable(),
      activityType: z.enum(['playing', 'competing']),
      isActive: z.boolean(),
      details: z.string().nullable(),
      state: z.string().nullable(),
      startedAt: z.iso.datetime().nullable(),
      firstObservedAt: z.iso.datetime(),
      lastObservedAt: z.iso.datetime(),
      sourceServerName: z.string().nullable(),
    })
    .nullable(),
  lastActiveLabel: z.string(),
  isFriend: z.boolean(),
  friendEligible: z.boolean(),
  contactHint: z.string(),
})

export const discoveryGamePlayerSchema = z.object({
  id: z.uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.url().nullable(),
  discordUserId: z.string().min(1).nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  intent: z.enum(['wishlist', 'interested', 'playing-now']),
  availability: z.string().nullable(),
  availabilitySource: availabilitySourceSchema.nullable(),
  mutualServers: z.array(z.string().min(1)),
  isFriend: z.boolean(),
  friendEligible: z.boolean(),
  contactHint: z.string(),
})

export const discoveryGameSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  coverUrl: z.url().nullable(),
  platformLabels: z.array(platformLabelSchema).min(1),
  sharedWithViewer: z.boolean(),
  playerCount: z.number().int().positive(),
  players: z.array(discoveryGamePlayerSchema).min(1),
})

export const discoveryFeedSchema = z.object({
  generatedAt: z.iso.datetime(),
  games: z.array(discoveryGameSchema),
  people: z.array(discoveryPersonSchema),
})

// ---------------------------------------------------------------------------
// Health, auth providers, authenticated user, profile, session
// ---------------------------------------------------------------------------

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.iso.datetime(),
  version: z.string(),
})

/** `GET /api/health/ready`: the API can serve requests (its database answers). */
export const readinessResponseSchema = z.object({
  status: z.literal('ready'),
  checks: z.object({ database: z.literal('ok') }),
  timestamp: z.iso.datetime(),
})

export const authProvidersResponseSchema = z.object({
  providers: z.array(
    z.object({
      id: authProviderSchema,
      label: z.string(),
      enabled: z.boolean(),
      primary: z.boolean(),
      clientId: z.string().min(1).nullable().optional(),
      requestedScopes: z.array(z.string().min(1)),
      installUrl: z.url().nullable().optional(),
      serverInstallUrl: z.url().nullable().optional(),
    }),
  ),
})

export const discordGraphCapabilitiesSchema = z.object({
  requestedScopes: z.array(z.string().min(1)),
  grantedScopes: z.array(z.string().min(1)),
  fallbackSources: z.array(z.enum(['mutual-servers', 'app-friends'])),
  guildSync: z.object({
    active: z.boolean(),
    lastSyncedAt: z.iso.datetime().nullable(),
  }),
  activityTracking: z.object({
    mode: z.literal('bot-presence-lossy'),
    botConfigured: z.boolean(),
    botConnected: z.boolean(),
    botGuildCount: z.number().int().nonnegative(),
    sharesServerWithBot: z.boolean(),
    lastObservedAt: z.iso.datetime().nullable(),
    currentActivity: z
      .object({
        title: z.string().min(1),
        applicationId: z.string().nullable(),
        activityType: z.enum(['playing', 'competing']),
        details: z.string().nullable(),
        state: z.string().nullable(),
        startedAt: z.iso.datetime().nullable(),
        firstObservedAt: z.iso.datetime(),
        lastObservedAt: z.iso.datetime(),
        sourceServerName: z.string().nullable(),
      })
      .nullable(),
    note: z.string(),
  }),
})

export const authenticatedUserSchema = z.object({
  id: z.uuid(),
  handle: z.string().min(2).max(32),
  displayName: z.string().min(2).max(60),
  avatarUrl: z.url().nullable(),
  email: z.email().nullable(),
  timezoneId: timezoneIdSchema,
  usualAvailability: z.string().nullable(),
  discordAutoPromptPlayIntent: z.boolean(),
  isAdmin: z.boolean(),
  authProvider: authProviderSchema,
})

export const inviteAttributionKindSchema = z.enum(['direct', 'server'])

export const authSessionInviteAttributionSchema = z.object({
  inviterUserId: z.uuid().nullable(),
  inviterDiscordUserId: z.string().min(1).nullable(),
  inviterLabel: z.string().min(1).nullable(),
  inviterDisplayName: z.string().min(1).nullable(),
  inviterHandle: z.string().min(1).nullable(),
  serverId: z.string().min(1).nullable(),
  serverName: z.string().min(1).nullable(),
  memberCount: z.number().int().nonnegative().nullable(),
  kind: inviteAttributionKindSchema,
  acceptedAt: z.iso.datetime(),
})

export const userProfileSchema = z.object({
  timezoneId: timezoneIdSchema,
  usualAvailability: z.string().nullable(),
  discordAutoPromptPlayIntent: z.boolean(),
})

export const userProfileResponseSchema = userProfileSchema

export const updateUserProfileRequestSchema = z.object({
  timezoneId: timezoneIdSchema.optional(),
  usualAvailability: z.string().trim().max(80).optional(),
  discordAutoPromptPlayIntent: z.boolean().optional(),
})

export const authSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: authenticatedUserSchema.nullable(),
  discordGraph: discordGraphCapabilitiesSchema.nullable(),
  inviteAttribution: authSessionInviteAttributionSchema.nullable(),
  connectedProviders: z.array(authProviderSchema).default([]),
})

// ---------------------------------------------------------------------------
// Admin debug snapshot (bot state, recent prompts, lifecycle events, errors)
// ---------------------------------------------------------------------------

export const debugDiscordBotStateSchema = z.object({
  mode: discordBotModeSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  guildIds: z.array(z.string().min(1)),
  guildCount: z.number().int().nonnegative(),
  userTag: z.string().nullable(),
  lastReadyAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
})

export const debugAutoPlayPromptStatusSchema = z.enum([
  'sent',
  'skipped',
  'failed',
  'accepted',
  'declined',
  'expired',
])

export const debugDmPreviewButtonStyleSchema = z.enum([
  'primary',
  'secondary',
  'danger',
  'link',
])

export const debugDmPreviewButtonSchema = z.object({
  label: z.string().min(1),
  style: debugDmPreviewButtonStyleSchema,
  disabled: z.boolean(),
  url: z.string().min(1).nullable(),
  customId: z.string().min(1).nullable(),
})

export const debugDmPreviewEmbedFieldSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  inline: z.boolean(),
})

export const debugDmPreviewEmbedSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  color: z.number().int().nonnegative().nullable(),
  fields: z.array(debugDmPreviewEmbedFieldSchema),
  footerText: z.string().nullable(),
  imageUrl: z.string().min(1).nullable(),
  thumbnailUrl: z.string().min(1).nullable(),
})

export const debugDmPreviewSelectMenuSchema = z.object({
  customId: z.string(),
  placeholder: z.string(),
  disabled: z.boolean(),
  minValues: z.number().int(),
  maxValues: z.number().int(),
  options: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      description: z.string().nullable(),
      selected: z.boolean(),
    }),
  ),
})

export const debugDmPreviewSchema = z.object({
  selectMenus: z.array(debugDmPreviewSelectMenuSchema).optional(),
  pending: z.boolean().optional(),
  content: z.string(),
  embeds: z.array(debugDmPreviewEmbedSchema),
  buttonRows: z.array(z.array(debugDmPreviewButtonSchema)),
})

export const debugAutoPlayPromptSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
  respondedAt: z.iso.datetime().nullable(),
  status: debugAutoPlayPromptStatusSchema,
  statusDetail: z.string().nullable(),
  dmError: z.string().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  notifyScope: playIntentNotifyScopeSchema.nullable(),
  friendRecipientCount: z.number().int().nonnegative(),
  networkRecipientCount: z.number().int().nonnegative(),
  sourceServerName: z.string().nullable(),
  observationStartedAt: z.iso.datetime().nullable(),
  createdPlayIntentId: z.uuid().nullable(),
  user: z.object({
    id: z.uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
    discordAutoPromptPlayIntent: z.boolean(),
  }),
  game: z.object({
    id: z.uuid(),
    title: z.string().min(1),
  }),
  dmPreview: debugDmPreviewSchema.nullable(),
})

export const debugNotificationDeliverySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
  title: z.string().min(1),
  body: z.string().min(1),
  gameTitle: z.string().nullable(),
  recipient: z.object({
    id: z.uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
  }),
  triggeredBy: z
    .object({
      id: z.uuid(),
      handle: z.string().min(2).max(32),
      displayName: z.string().min(2).max(60),
    })
    .nullable(),
  friendInvitePreview: debugDmPreviewSchema.nullable().default(null),
  dmPreview: debugDmPreviewSchema.nullable(),
})

export const debugInviteAttributionSchema = z.object({
  id: z.uuid(),
  acceptedAt: z.iso.datetime(),
  kind: inviteAttributionKindSchema,
  serverId: z.string().min(1).nullable(),
  serverName: z.string().min(1).nullable(),
  memberCount: z.number().int().nonnegative().nullable(),
  acceptedUser: z.object({
    id: z.uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
  }),
  inviterUser: z
    .object({
      id: z.uuid(),
      handle: z.string().min(2).max(32),
      displayName: z.string().min(2).max(60),
    })
    .nullable(),
  inviterDiscordUserId: z.string().min(1).nullable(),
  inviterLabel: z.string().min(1).nullable(),
})

export const debugPlayIntentStatusSchema = z.enum(['active', 'ended'])

export const debugPlayIntentSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  windowStartsAt: z.iso.datetime(),
  windowEndsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
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
    id: z.uuid(),
    handle: z.string().min(2).max(32),
    displayName: z.string().min(2).max(60),
    timezoneId: timezoneIdSchema,
  }),
})

export const debugPlayIntentLifecycleEventSourceSchema = z.enum([
  'play-intent',
  'notification',
  'auto-play-prompt',
  'system',
])

export const debugPlayIntentLifecycleEventSchema = z.object({
  id: z.string().min(1),
  playIntentId: z.uuid(),
  occurredAt: z.iso.datetime(),
  source: debugPlayIntentLifecycleEventSourceSchema,
  eventType: z.string().min(1),
  summary: z.string().min(1),
  details: z.string().nullable(),
  isError: z.boolean(),
  notificationId: z.uuid().nullable(),
  promptId: z.uuid().nullable(),
  actorDisplayName: z.string().min(1).nullable(),
  recipientDisplayName: z.string().min(1).nullable(),
})

export const debugErrorLogSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.iso.datetime(),
  source: debugPlayIntentLifecycleEventSourceSchema,
  message: z.string().min(1),
  detail: z.string().nullable(),
  playIntentId: z.uuid().nullable(),
  notificationId: z.uuid().nullable(),
  promptId: z.uuid().nullable(),
})

export const debugAdminResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  bot: debugDiscordBotStateSchema,
  recentAutoPlayPrompts: z.array(debugAutoPlayPromptSchema),
  recentInviteAttributions: z.array(debugInviteAttributionSchema),
  recentNotifications: z.array(debugNotificationDeliverySchema),
  recentPlayIntents: z.array(debugPlayIntentSummarySchema),
  playIntentLifecycleEvents: z.array(debugPlayIntentLifecycleEventSchema),
  recentErrors: z.array(debugErrorLogSchema),
})

// ---------------------------------------------------------------------------
// User-defined aliases (per-platform handles, per-game preferred titles) and
// audience-side mutes that suppress notifications from a specific creator.
// ---------------------------------------------------------------------------

export const userPlatformAliasSchema = z.object({
  id: z.uuid(),
  platform: z.string().min(1).max(32),
  aliasValue: z.string().min(1).max(80),
})

export const userPlatformAliasesResponseSchema = z.object({
  aliases: z.array(userPlatformAliasSchema),
})

export const upsertUserPlatformAliasRequestSchema = z.object({
  aliasValue: z.string().trim().min(1).max(80),
})

export const userGameAliasSchema = z.object({
  id: z.uuid(),
  gameId: z.uuid(),
  gameTitle: z.string().min(1),
  aliasValue: z.string().min(1).max(80),
})

export const userGameAliasesResponseSchema = z.object({
  aliases: z.array(userGameAliasSchema),
})

export const upsertUserGameAliasRequestSchema = z.object({
  aliasValue: z.string().trim().min(1).max(80),
})

export const playIntentMuteSchema = z.object({
  mutedUserId: z.uuid(),
  mutedUserDisplayName: z.string().min(1),
  mutedUserHandle: z.string().min(1),
  mutedUserAvatarUrl: z.url().nullable(),
})

export const playIntentMutesResponseSchema = z.object({
  mutes: z.array(playIntentMuteSchema),
})

// ---------------------------------------------------------------------------
// Client bootstrap, dashboard SSE invalidation envelope, and server env
// ---------------------------------------------------------------------------

export const clientBootstrapSchema = z.object({
  appName: z.string(),
  apiBaseUrl: z.url(),
  features: z.object({
    pushNotifications: z.boolean(),
    multiGamePlayIntent: z.boolean(),
  }),
})

export const dashboardInvalidationDomainSchema = z.enum([
  'auth',
  'profile',
  'library',
  'network',
  'discovery',
  'play-intents',
])

export const dashboardInvalidationEventSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.iso.datetime(),
  domains: z.array(dashboardInvalidationDomainSchema).min(1),
})

export const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.url(),
  SESSION_SECRET: z.string().min(16),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_PUBLIC_KEY: z.string().optional(),
  DISCORD_CALLBACK_URL: z.url().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_BOT_MODE: discordBotModeSchema.optional(),
  DISCORD_SERVER_ID: z.string().optional(),
  DISCORD_SEND_REAL_DMS_IN_DEV: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  STEAM_CALLBACK_URL: z.url().optional(),
  STEAM_WEB_API_KEY: z.string().optional(),
  RAWG_API_KEY: z.string().optional(),
  ADMIN_HANDLES: z.string().optional(),
  /** The built web app's folder; when set (the production image), the API serves the app too. */
  WEB_DIST_DIR: z.string().min(1).optional(),
})

// ---------------------------------------------------------------------------
// Inferred TypeScript types for every schema above. New schemas should add
// their `z.infer` line here so the contract surface stays scannable.
// ---------------------------------------------------------------------------

export type AuthProvider = z.infer<typeof authProviderSchema>
export type PlatformLabel = z.infer<typeof platformLabelSchema>
export type CatalogProvider = z.infer<typeof catalogProviderSchema>
export type AvailabilitySource = z.infer<typeof availabilitySourceSchema>
export type CatalogGameMatch = z.infer<typeof catalogGameMatchSchema>
export type LibraryEntryIntent = z.infer<typeof libraryEntryIntentSchema>
export type LibraryEntry = z.infer<typeof libraryEntrySchema>
export type LibrarySuggestedGame = z.infer<typeof librarySuggestedGameSchema>
export type LibraryTrendingGame = z.infer<typeof libraryTrendingGameSchema>
export type LibraryResponse = z.infer<typeof libraryResponseSchema>
export type SteamLibraryImportStatus = z.infer<
  typeof steamLibraryImportStatusSchema
>
export type SteamLibraryImportGame = z.infer<
  typeof steamLibraryImportGameSchema
>
export type SteamLibraryImportAccount = z.infer<
  typeof steamLibraryImportAccountSchema
>
export type SteamLibraryImportPreviewResponse = z.infer<
  typeof steamLibraryImportPreviewResponseSchema
>
export type SteamLinkIntentResponse = z.infer<
  typeof steamLinkIntentResponseSchema
>
export type SteamLibraryImportSelection = z.infer<
  typeof steamLibraryImportSelectionSchema
>
export type ImportSteamLibrarySelectionRequest = z.infer<
  typeof importSteamLibrarySelectionRequestSchema
>
export type GameSearchResult = z.infer<typeof gameSearchResultSchema>
export type GameSearchResponse = z.infer<typeof gameSearchResponseSchema>
export type GameDetailsClassification = z.infer<
  typeof gameDetailsClassificationSchema
>
export type GameDetailsGameplay = z.infer<typeof gameDetailsGameplaySchema>
export type GameDetailsMediaItem = z.infer<typeof gameDetailsMediaItemSchema>
export type GameDetailsStoreLink = z.infer<typeof gameDetailsStoreLinkSchema>
export type GameDetails = z.infer<typeof gameDetailsSchema>
export type GameDetailsResponse = z.infer<typeof gameDetailsResponseSchema>
export type DiscordServerPreference = z.infer<
  typeof discordServerPreferenceSchema
>
export type DiscordServerPreferencesResponse = z.infer<
  typeof discordServerPreferencesResponseSchema
>
export type DiscordServerMember = z.infer<typeof discordServerMemberSchema>
export type DiscordServerMembersResponse = z.infer<
  typeof discordServerMembersResponseSchema
>
export type DiscordVoiceChannel = z.infer<typeof discordVoiceChannelSchema>
export type DiscordVoiceChannelsResponse = z.infer<
  typeof discordVoiceChannelsResponseSchema
>
export type PlayIntentTargetDiscordServer = z.infer<
  typeof playIntentTargetDiscordServerSchema
>
export type SendDiscordServerInvitesRequest = z.infer<
  typeof sendDiscordServerInvitesRequestSchema
>
export type SendDiscordServerInvitesResult = z.infer<
  typeof sendDiscordServerInvitesResultSchema
>
export type SendDiscordServerInvitesResponse = z.infer<
  typeof sendDiscordServerInvitesResponseSchema
>
export type UpdateDiscordServerPreferenceRequest = z.infer<
  typeof updateDiscordServerPreferenceRequestSchema
>
export type UpsertLibraryEntryRequest = z.infer<
  typeof upsertLibraryEntryRequestSchema
>
export type DiscoveryPersonGame = z.infer<typeof discoveryPersonGameSchema>
export type DiscoveryPerson = z.infer<typeof discoveryPersonSchema>
export type DiscoveryGamePlayer = z.infer<typeof discoveryGamePlayerSchema>
export type DiscoveryGame = z.infer<typeof discoveryGameSchema>
export type DiscoveryFeed = z.infer<typeof discoveryFeedSchema>
export type PlayIntentSelectionMode = z.infer<
  typeof playIntentSelectionModeSchema
>
export type PlayIntentNotifyScope = z.infer<typeof playIntentNotifyScopeSchema>
export type PlayIntentDiscordSpaceStatus = z.infer<
  typeof playIntentDiscordSpaceStatusSchema
>
export type PlayIntentDiscordSpace = z.infer<
  typeof playIntentDiscordSpaceSchema
>
export type PlayIntentPreview = z.infer<typeof playIntentPreviewSchema>
export type PlayIntentExpandedGame = z.infer<
  typeof playIntentExpandedGameSchema
>
export type PlayIntentExpandedGameScope = z.infer<
  typeof playIntentExpandedGameScopeSchema
>
export type PlayIntentDetail = z.infer<typeof playIntentDetailSchema>
export type PlayIntentFeed = z.infer<typeof playIntentFeedSchema>
export type PlayIntentDetailResponse = z.infer<
  typeof playIntentDetailResponseSchema
>
export type ActivePlayIntent = z.infer<typeof activePlayIntentSchema>
export type PlayIntentCurrentResponse = z.infer<
  typeof playIntentCurrentResponseSchema
>
export type PlayIntentInterestedUser = z.infer<
  typeof playIntentInterestedUserSchema
>
export type PlayIntentRecipientResponseChoice = z.infer<
  typeof playIntentRecipientResponseChoiceSchema
>
export type PlayIntentRecipientAction = z.infer<
  typeof playIntentRecipientActionSchema
>
export type PlayIntentRecipientResponseRequest = z.infer<
  typeof playIntentRecipientResponseRequestSchema
>
export type PlayIntentRecipientResponseResult = z.infer<
  typeof playIntentRecipientResponseResultSchema
>
export type PlayIntentDiscordSpaceRetryResponse = z.infer<
  typeof playIntentDiscordSpaceRetryResponseSchema
>
export type UpsertPlayIntentRequest = z.infer<
  typeof upsertPlayIntentRequestSchema
>
export type UpsertPlayIntentResponse = z.infer<
  typeof upsertPlayIntentResponseSchema
>
export type FriendsList = z.infer<typeof friendsListSchema>
export type FriendsListsResponse = z.infer<typeof friendsListsResponseSchema>
export type FriendsListResponse = z.infer<typeof friendsListResponseSchema>
export type UpsertFriendsListRequest = z.infer<
  typeof upsertFriendsListRequestSchema
>
export type DeleteFriendsListResponse = z.infer<
  typeof deleteFriendsListResponseSchema
>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>
export type AuthProvidersResponse = z.infer<typeof authProvidersResponseSchema>
export type DiscordGraphCapabilities = z.infer<
  typeof discordGraphCapabilitiesSchema
>
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>
export type UpdateUserProfileRequest = z.infer<
  typeof updateUserProfileRequestSchema
>
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
export type DebugDiscordBotState = z.infer<typeof debugDiscordBotStateSchema>
export type DebugAutoPlayPromptStatus = z.infer<
  typeof debugAutoPlayPromptStatusSchema
>
export type DebugDmPreviewButtonStyle = z.infer<
  typeof debugDmPreviewButtonStyleSchema
>
export type DebugDmPreviewButton = z.infer<typeof debugDmPreviewButtonSchema>
export type DebugDmPreview = z.infer<typeof debugDmPreviewSchema>
export type DebugAutoPlayPrompt = z.infer<typeof debugAutoPlayPromptSchema>
export type DebugInviteAttribution = z.infer<
  typeof debugInviteAttributionSchema
>
export type DebugNotificationDelivery = z.infer<
  typeof debugNotificationDeliverySchema
>
export type DebugPlayIntentStatus = z.infer<typeof debugPlayIntentStatusSchema>
export type DebugPlayIntentSummary = z.infer<
  typeof debugPlayIntentSummarySchema
>
export type DebugPlayIntentLifecycleEventSource = z.infer<
  typeof debugPlayIntentLifecycleEventSourceSchema
>
export type DebugPlayIntentLifecycleEvent = z.infer<
  typeof debugPlayIntentLifecycleEventSchema
>
export type DebugErrorLog = z.infer<typeof debugErrorLogSchema>
export type DebugAdminResponse = z.infer<typeof debugAdminResponseSchema>
export type ClientBootstrap = z.infer<typeof clientBootstrapSchema>
export type DashboardInvalidationDomain = z.infer<
  typeof dashboardInvalidationDomainSchema
>
export type DashboardInvalidationEvent = z.infer<
  typeof dashboardInvalidationEventSchema
>
export type ServerEnv = z.infer<typeof serverEnvSchema>
export type UserPlatformAlias = z.infer<typeof userPlatformAliasSchema>
export type UserPlatformAliasesResponse = z.infer<
  typeof userPlatformAliasesResponseSchema
>
export type UpsertUserPlatformAliasRequest = z.infer<
  typeof upsertUserPlatformAliasRequestSchema
>
export type UserGameAlias = z.infer<typeof userGameAliasSchema>
export type UserGameAliasesResponse = z.infer<
  typeof userGameAliasesResponseSchema
>
export type UpsertUserGameAliasRequest = z.infer<
  typeof upsertUserGameAliasRequestSchema
>
export type PlayIntentMute = z.infer<typeof playIntentMuteSchema>
export type PlayIntentInvitableFriendsResponse = z.infer<
  typeof playIntentInvitableFriendsResponseSchema
>
export type PlayIntentMutesResponse = z.infer<
  typeof playIntentMutesResponseSchema
>

export * from './debug-dm-simulator.js'
export * from './dateTime.js'
export * from './api-errors.js'

export * from './discord-action-pending.js'
