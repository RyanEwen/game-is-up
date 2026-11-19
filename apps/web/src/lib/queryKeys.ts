/**
 * Every TanStack Query key the app uses, built in one place so a query and the code that
 * invalidates it cannot drift apart. Keys are arrays whose first element is the resource
 * family, so `invalidateQueries({ queryKey: ['library'] })` covers every library query.
 */
export const queryKeys = {
  health: () => ['health'] as const,
  bootstrap: () => ['bootstrap'] as const,
  authProviders: () => ['auth', 'providers'] as const,
  session: () => ['auth', 'session'] as const,
  discoveryFeed: () => ['discovery', 'feed'] as const,
  playIntentFeed: () => ['play-intents', 'feed'] as const,
  currentPlayIntent: () => ['play-intents', 'current'] as const,
  playIntentDetail: (playIntentId: string) =>
    ['play-intents', 'detail', playIntentId] as const,
  playIntentInvitableFriends: (playIntentId: string) =>
    ['play-intents', 'detail', playIntentId, 'invitable-friends'] as const,
  playIntentMutes: () => ['play-intents', 'mutes'] as const,
  library: () => ['library', 'me'] as const,
  libraryCatalog: (term: string) => ['library', 'catalog', term] as const,
  steamImportPreview: () => ['library', 'steam-import-preview'] as const,
  gameDetails: (source: string, sourceId: string) =>
    ['library', 'game-details', source, sourceId] as const,
  platformAliases: () => ['aliases', 'platforms'] as const,
  gameAliases: () => ['aliases', 'games'] as const,
  friendsLists: () => ['friends-lists'] as const,
  discordServers: () => ['discord-servers', 'me'] as const,
  discordServerMembers: (serverId: string) =>
    ['discord-servers', serverId, 'members'] as const,
  discordVoiceChannels: () => ['discord-servers', 'voice-channels'] as const,
  debugAdmin: () => ['debug', 'admin'] as const,
} as const
