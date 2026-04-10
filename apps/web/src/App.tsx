import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import {
  Box,
  Button,
  Card,
  Chip,
  CssBaseline,
  Divider,
  Input,
  Link,
  Sheet,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography
} from '@mui/joy'
import { CssVarsProvider } from '@mui/joy/styles'
import type {
  ActivePlayIntent,
  AvailabilitySource,
  AuthSessionResponse,
  DiscordServerMembersResponse,
  DiscordServerPreferencesResponse,
  SendDiscordServerInvitesResponse,
  AuthProvidersResponse,
  DiscoveryGame,
  GameSearchResult,
  DiscoveryFeed,
  DiscoveryPerson,
  GameSearchResponse,
  HealthResponse,
  LibraryEntry,
  LibraryEntryIntent,
  LibraryResponse,
  PlayIntentCurrentResponse,
  UserProfileResponse,
  PlayIntentFeed,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentSelectionMode,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import {
  playIntentCurrentResponseSchema,
  authSessionResponseSchema,
  discordServerMembersResponseSchema,
  discordServerPreferencesResponseSchema,
  sendDiscordServerInvitesResponseSchema,
  authProvidersResponseSchema,
  discoveryFeedSchema,
  gameSearchResponseSchema,
  healthResponseSchema,
  libraryResponseSchema,
  playIntentFeedSchema,
  upsertPlayIntentResponseSchema,
  userProfileResponseSchema
} from '@game-is-up/shared'
import { theme } from './theme/theme'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
const apiReconnectPollMs = 5000
const mobileAuthRedirectUrl = 'gameisup://auth'
const configuredPublicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL
const defaultPlatformOptions = ['PC', 'Xbox', 'PlayStation', 'Switch', 'Mobile', 'macOS', 'Linux'] as const

type LoadState = {
  activePlayIntent: ActivePlayIntent | null;
  session: AuthSessionResponse | null;
  auth: AuthProvidersResponse | null;
  discordServers: DiscordServerPreferencesResponse | null;
  discovery: DiscoveryFeed | null;
  health: HealthResponse | null;
  library: LibraryResponse | null;
  playIntents: PlayIntentFeed | null;
  error: string | null;
};

type Notice = {
  tone: 'neutral' | 'success' | 'danger';
  message: string;
};

type DashboardTab = 'overview' | 'discovery' | 'library' | 'play';
type PlayIntentTimingMode = 'preset' | 'custom' | 'end-time';

const minimumPlayIntentDurationMinutes = 15
const maximumPlayIntentDurationMinutes = 24 * 60
const playIntentPresetDurations = [60, 120, 240] as const

const dashboardTabSx = {
  flexGrow: 1,
  minHeight: 52,
  borderRadius: 'lg',
  color: 'neutral.300',
  fontWeight: 'md',
  transition: 'background-color 180ms ease, color 180ms ease, box-shadow 180ms ease',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: 'neutral.100'
  },
  '&.Mui-selected': {
    color: 'primary.200',
    background: 'linear-gradient(180deg, rgba(20, 136, 106, 0.26), rgba(15, 84, 68, 0.18))',
    boxShadow: 'inset 0 0 0 1px rgba(141, 255, 216, 0.16), 0 10px 20px -16px rgba(15, 84, 68, 0.9)'
  }
} as const

const initialState: LoadState = {
  activePlayIntent: null,
  session: null,
  auth: null,
  discordServers: null,
  discovery: null,
  health: null,
  library: null,
  playIntents: null,
  error: null
}

type FriendTarget = {
  id: string;
  displayName: string;
  friendEligible: boolean;
};

function formatLibraryIntentLabel(intent: LibraryEntryIntent): string {
  switch (intent) {
    case 'wishlist':
      return 'Wishlist'
    case 'playing-now':
      return 'Playing now'
    default:
      return 'Interested'
  }
}

function formatNotifyScopeLabel(scope: PlayIntentPreview['notifyScope']): string {
  switch (scope) {
    case 'discovery-and-friends':
      return 'Discovery + friends'
    default:
      return 'Friends only'
  }
}

function formatNotifyScopeDescription(scope: PlayIntentPreview['notifyScope']): string {
  switch (scope) {
    case 'discovery-and-friends':
      return 'Anyone on a shared discovery server that both of you opted into can see it, plus people you added as friends. Matching game overlap still applies.'
    default:
      return 'Only people you added as friends can see it, and they still need a matching game overlap.'
  }
}

function formatPlayIntentSelectionModeLabel(selectionMode: PlayIntentSelectionMode): string {
  return selectionMode === 'library' ? 'Any game in my library' : 'Only selected games'
}

function formatPlayIntentDurationLabel(durationMinutes: number): string {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} min`
}

function parsePlayIntentDurationMinutes(value: string): number | null {
  const trimmedValue = value.trim()

  if (!/^\d+$/.test(trimmedValue)) {
    return null
  }

  const durationMinutes = Number(trimmedValue)

  return Number.isInteger(durationMinutes) ? durationMinutes : null
}

function toLocalDateTimeInputValue(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)

  return localDate.toISOString().slice(0, 16)
}

function buildPlayIntentEndTimeInputValue(durationMinutes: number, baseDate = new Date()): string {
  return toLocalDateTimeInputValue(new Date(baseDate.getTime() + durationMinutes * 60 * 1000))
}

function parsePlayIntentEndAt(value: string): Date | null {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

function normalizeInviteUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }

  try {
    const inviteUrl = new URL(value)

    if (inviteUrl.protocol !== 'http:' && inviteUrl.protocol !== 'https:') {
      return null
    }

    inviteUrl.search = ''
    inviteUrl.hash = ''

    return inviteUrl.toString()
  } catch {
    return null
  }
}

function resolveInviteUrl(currentHref: string | null): string | null {
  const configuredUrl = normalizeInviteUrl(configuredPublicAppUrl)

  if (configuredUrl) {
    return configuredUrl
  }

  return normalizeInviteUrl(currentHref)
}

function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return ''
  }

  if (names.length === 1) {
    return names[0] ?? ''
  }

  if (names.length === 2) {
    return `${names[0] ?? ''} and ${names[1] ?? ''}`
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

function buildInviteText(
  displayName: string | null | undefined,
  inviteUrl: string,
  options?: {
    serverName?: string;
    targetedNames?: string[];
  }
): string {
  const targetedNames = options?.targetedNames ?? []
  const intro = targetedNames.length > 0
    ? `Hey ${formatNameList(targetedNames)}${options?.serverName ? `, I found you through ${options.serverName} on Game Is Up.` : '.'}`
    : displayName
      ? `${displayName} invited you to Game Is Up.`
      : 'Join me on Game Is Up.'

  const body = targetedNames.length > 0
    ? 'Open the app to compare libraries, add each other as friends, and post when you want to play.'
    : 'Use it to find players, compare libraries, and post when you want to play.'

  return `${intro}\n\n${body}\n\n${inviteUrl}`
}

function formatScopeLabel(scope: string): string {
  switch (scope) {
    case 'identify':
      return 'Discord identity'
    case 'email':
      return 'Email'
    case 'guilds':
      return 'Discord servers'
    case 'relationships.read':
      return 'Discord friends'
    default:
      return scope
  }
}

function formatDiscordActivityTypeLabel(activityType: 'playing' | 'competing'): string {
  return activityType === 'competing' ? 'Competing in' : 'Playing on Discord'
}

function renderAvailabilityChip(
  availability: string | null,
  availabilitySource: AvailabilitySource | null,
  options?: {
    showInherited?: boolean;
  }
) {
  if (!availability || !availabilitySource) {
    return null
  }

  if (availabilitySource === 'profile-default' && options?.showInherited === false) {
    return null
  }

  const label = availabilitySource === 'game-specific' ? `This game: ${availability}` : `Usually: ${availability}`

  return (
    <Chip size="sm" variant="outlined" color="warning">
      {label}
    </Chip>
  )
}

function PersonCard({
  person,
  canManage,
  isPending,
  onToggleFriend
}: {
  person: DiscoveryPerson;
  canManage: boolean;
  isPending: boolean;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(17, 24, 38, 0.74)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        boxShadow: 'lg'
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Chip size="sm" color="primary" variant="soft">
          {person.handle}
        </Chip>
        <Typography level="title-lg">{person.displayName}</Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          {person.lastActiveLabel}
        </Typography>
      </Stack>

      <Typography level="body-md" sx={{ mb: 2, color: 'neutral.200' }}>
        {person.bio}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {person.mutualServers.map((serverName) => (
          <Chip key={serverName} size="sm" color="warning" variant="soft">
            {serverName}
          </Chip>
        ))}
        <Chip variant="outlined" color="warning">
          {person.timezoneLabel}
        </Chip>
        {person.usualAvailability ? (
          <Chip variant="soft" color="success">
            Usually: {person.usualAvailability}
          </Chip>
        ) : null}
      </Stack>

      {person.discordActivity ? (
        <Sheet
          variant="soft"
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 'md'
          }}
        >
          <Typography level="title-sm">
            {formatDiscordActivityTypeLabel(person.discordActivity.activityType)} {person.discordActivity.title}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Last seen {new Date(person.discordActivity.lastObservedAt).toLocaleString()}
            {person.discordActivity.sourceServerName ? ` via ${person.discordActivity.sourceServerName}` : ''}
          </Typography>
          {person.discordActivity.details || person.discordActivity.state ? (
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              {[person.discordActivity.details, person.discordActivity.state].filter(Boolean).join(' • ')}
            </Typography>
          ) : null}
        </Sheet>
      ) : null}

      <Stack spacing={1} sx={{ mb: 2 }}>
        {person.games.length > 0 ? (
          person.games.map((game) => (
            <Sheet
              key={game.id}
              variant="soft"
              sx={{
                p: 1.5,
                borderRadius: 'md',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
                alignItems: 'center'
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 40,
                    height: 54,
                    borderRadius: 'sm',
                    overflow: 'hidden',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    flexShrink: 0
                  }}
                >
                  {game.coverUrl ? (
                    <Box component="img" src={game.coverUrl} alt={game.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : null}
                </Box>
                <Box>
                  <Typography level="title-sm">{game.title}</Typography>
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                    {game.platformLabels.join(', ')}
                  </Typography>
                  {game.availability && game.availabilitySource === 'game-specific' ? (
                    <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                      {renderAvailabilityChip(game.availability, game.availabilitySource, { showInherited: false })}
                    </Stack>
                  ) : null}
                </Box>
              </Stack>
              <Chip color={game.intent === 'playing-now' ? 'success' : 'primary'} size="sm">
                {game.intent}
              </Chip>
            </Sheet>
          ))
        ) : (
          <Sheet
            variant="soft"
            sx={{
              p: 1.5,
              borderRadius: 'md'
            }}
          >
            <Typography level="title-sm">No games shared yet</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              This person is visible through your discovery servers or friends list, but they have not added any games yet. You can still add them as an in-app friend now.
            </Typography>
          </Sheet>
        )}
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Button
          color="primary"
          size="lg"
          variant={person.friendEligible ? 'solid' : 'soft'}
          disabled={!canManage || isPending}
          onClick={() => void onToggleFriend(person)}
        >
          {!canManage
            ? 'Sign in to manage friends'
            : isPending
              ? 'Saving...'
              : person.friendEligible
                ? 'Add friend'
                : 'Remove friend'}
        </Button>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          {person.contactHint}
        </Typography>
      </Stack>
    </Card>
  )
}

function GameCard({
  game,
  canManage,
  pendingFriendId,
  onToggleFriend
}: {
  game: DiscoveryGame;
  canManage: boolean;
  pendingFriendId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(13, 18, 30, 0.82)'
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Box
          sx={{
            width: { xs: '100%', md: 120 },
            height: { xs: 160, md: 160 },
            borderRadius: 'md',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.06)',
            flexShrink: 0
          }}
        >
          {game.coverUrl ? (
            <Box component="img" src={game.coverUrl} alt={game.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : null}
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
            <Typography level="title-lg">{game.title}</Typography>
            {game.sharedWithViewer ? (
              <Chip color="success" variant="soft">
                Also in your library
              </Chip>
            ) : null}
            <Chip color="primary" variant="outlined">
              {game.playerCount} player{game.playerCount === 1 ? '' : 's'}
            </Chip>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {game.platformLabels.map((platform) => (
              <Chip key={platform} size="sm" variant="outlined" color="neutral">
                {platform}
              </Chip>
            ))}
          </Stack>
        </Stack>
      </Stack>

      <Stack spacing={1.25}>
        {game.players.map((player) => (
          <Sheet
            key={player.id}
            variant="soft"
            sx={{
              p: 1.5,
              borderRadius: 'md'
            }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
                  <Typography level="title-sm">{player.displayName}</Typography>
                  <Chip size="sm" variant="soft" color="primary">
                    @{player.handle}
                  </Chip>
                  <Chip size="sm" color={player.intent === 'playing-now' ? 'success' : 'primary'}>
                    {player.intent}
                  </Chip>
                </Stack>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  {player.platformLabels.join(', ')}
                </Typography>
                {player.availability ? (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {renderAvailabilityChip(player.availability, player.availabilitySource, { showInherited: true })}
                  </Stack>
                ) : null}
                {player.mutualServers.length > 0 ? (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {player.mutualServers.map((serverName) => (
                      <Chip key={serverName} size="sm" variant="soft" color="warning">
                        {serverName}
                      </Chip>
                    ))}
                  </Stack>
                ) : null}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button
                  size="sm"
                  color="primary"
                  variant={player.friendEligible ? 'solid' : 'soft'}
                  disabled={!canManage || pendingFriendId === player.id}
                  onClick={() => void onToggleFriend(player)}
                >
                  {!canManage
                    ? 'Sign in to manage friends'
                    : pendingFriendId === player.id
                      ? 'Saving...'
                      : player.friendEligible
                        ? 'Add friend'
                        : 'Remove friend'}
                </Button>
              </Stack>
            </Stack>
          </Sheet>
        ))}
      </Stack>
    </Card>
  )
}

function PlayIntentCard({ intent }: { intent: PlayIntentPreview }) {
  const isLibraryWide = intent.selectionMode === 'library'

  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(13, 18, 30, 0.82)'
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Box>
          <Typography level="title-lg">{intent.title}</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            {intent.availabilityWindow.label}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip color="primary" variant="soft">
            {isLibraryWide ? 'Any game in library' : 'Selected games'}
          </Chip>
          <Chip color="warning" variant="outlined">
            {formatNotifyScopeLabel(intent.notifyScope)}
          </Chip>
        </Stack>
      </Stack>

      <Typography level="body-md" sx={{ mb: 2, color: 'neutral.200' }}>
        {intent.note}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {intent.platforms.map((platform) => (
          <Chip key={platform} variant="outlined" color="neutral">
            {platform}
          </Chip>
        ))}
      </Stack>

      {isLibraryWide ? (
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          Recipient matching will compare this play intent against the sender&apos;s active library and the recipient&apos;s overlap instead of a single chosen title.
        </Typography>
      ) : (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {intent.games.map((game) => (
            <Chip key={game.id} color="success" variant="soft">
              {game.title}
            </Chip>
          ))}
        </Stack>
      )}
    </Card>
  )
}

function EmptyStateCard({
  title,
  body,
  chips
}: {
  title: string;
  body: string;
  chips: string[];
}) {
  return (
    <Card
      variant="soft"
      sx={{
        p: 3,
        border: '1px dashed rgba(255, 255, 255, 0.14)',
        backgroundColor: 'rgba(13, 18, 30, 0.65)'
      }}
    >
      <Stack spacing={1.5}>
        <Typography level="title-lg">{title}</Typography>
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          {body}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {chips.map((chip) => (
            <Chip key={chip} variant="outlined" color="neutral">
              {chip}
            </Chip>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}

function LibraryEntryRow({
  entry,
  isEditing,
  editDisabled,
  isRemoving,
  onEdit,
  onRemove
}: {
  entry: LibraryEntry;
  isEditing: boolean;
  editDisabled: boolean;
  isRemoving: boolean;
  onEdit: (entry: LibraryEntry) => void;
  onRemove: (entryId: string) => Promise<void>;
}) {
  return (
    <Sheet
      variant="soft"
      sx={{
        p: 1.5,
        borderRadius: 'md',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 2,
        alignItems: 'center',
        flexDirection: { xs: 'column', sm: 'row' }
      }}
    >
      <Box sx={{ flex: 1 }}>
        <Typography level="title-sm">{entry.title}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
          {entry.platformLabels.map((platformLabel) => (
            <Chip key={platformLabel} size="sm" variant="outlined" color="neutral">
              {platformLabel}
            </Chip>
          ))}
          {isEditing ? (
            <Chip size="sm" variant="soft" color="success">
              Editing
            </Chip>
          ) : null}
          <Chip size="sm" variant="soft" color="primary">
            {formatLibraryIntentLabel(entry.intent)}
          </Chip>
          {renderAvailabilityChip(entry.availability, entry.availabilitySource, { showInherited: true })}
        </Stack>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button size="sm" variant={isEditing ? 'soft' : 'outlined'} color="primary" disabled={editDisabled} onClick={() => onEdit(entry)}>
          {isEditing ? 'Editing' : 'Edit'}
        </Button>
        <Button size="sm" variant="outlined" color="neutral" disabled={isRemoving} onClick={() => void onRemove(entry.id)}>
          {isRemoving ? 'Removing...' : 'Remove'}
        </Button>
      </Stack>
    </Sheet>
  )
}

export default function App() {
  const [state, setState] = useState<LoadState>(initialState)
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [authNotice, setAuthNotice] = useState<Notice | null>(null)
  const [actionNotice, setActionNotice] = useState<Notice | null>(null)
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null)
  const [playIntentNotice, setPlayIntentNotice] = useState<Notice | null>(null)
  const [libraryTitle, setLibraryTitle] = useState('')
  const [selectedPlatformLabels, setSelectedPlatformLabels] = useState<string[]>(['PC'])
  const [libraryAvailability, setLibraryAvailability] = useState('')
  const [usualAvailability, setUsualAvailability] = useState('')
  const [playIntentSelectionMode, setPlayIntentSelectionMode] = useState<PlayIntentSelectionMode>('library')
  const [playIntentNotifyScope, setPlayIntentNotifyScope] = useState<PlayIntentNotifyScope>('discovery-and-friends')
  const [playIntentTimingMode, setPlayIntentTimingMode] = useState<PlayIntentTimingMode>('preset')
  const [playIntentDurationMinutes, setPlayIntentDurationMinutes] = useState(120)
  const [playIntentCustomDurationInput, setPlayIntentCustomDurationInput] = useState('120')
  const [playIntentEndAtInput, setPlayIntentEndAtInput] = useState(() => buildPlayIntentEndTimeInputValue(120))
  const [playIntentNote, setPlayIntentNote] = useState('')
  const [selectedPlayIntentGameIds, setSelectedPlayIntentGameIds] = useState<string[]>([])
  const [libraryIntent, setLibraryIntent] = useState<LibraryEntryIntent>('interested')
  const [librarySaving, setLibrarySaving] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [playIntentSaving, setPlayIntentSaving] = useState(false)
  const [gameSuggestions, setGameSuggestions] = useState<GameSearchResponse['results']>([])
  const [gameSuggestionsLoading, setGameSuggestionsLoading] = useState(false)
  const [selectedCatalogResult, setSelectedCatalogResult] = useState<GameSearchResult | null>(null)
  const [editingLibraryEntryId, setEditingLibraryEntryId] = useState<string | null>(null)
  const [removingLibraryEntryId, setRemovingLibraryEntryId] = useState<string | null>(null)
  const [friendPendingId, setFriendPendingId] = useState<string | null>(null)
  const [serverPreferencePendingId, setServerPreferencePendingId] = useState<string | null>(null)
  const [inviteServerId, setInviteServerId] = useState<string | null>(null)
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([])
  const [inviteMembersState, setInviteMembersState] = useState<DiscordServerMembersResponse | null>(null)
  const [inviteMembersLoading, setInviteMembersLoading] = useState(false)
  const [inviteMembersNotice, setInviteMembersNotice] = useState<Notice | null>(null)
  const [inviteMemberQuery, setInviteMemberQuery] = useState('')
  const [inviteMembersReloadVersion, setInviteMembersReloadVersion] = useState(0)
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteSendSummary, setInviteSendSummary] = useState<SendDiscordServerInvitesResponse | null>(null)
  const libraryEditorRef = useRef<HTMLDivElement | null>(null)
  const lastHandledAuthUrlRef = useRef<string | null>(null)
  const isNativeApp = Capacitor.isNativePlatform()

  const isSignedIn = Boolean(state.session?.authenticated && state.session.user)
  const libraryEntries = state.library?.entries ?? []
  const discoveryGames = state.discovery?.games ?? []
  const discoveryPeople = state.discovery?.people ?? []
  const overlapGames = discoveryGames.filter((game) => game.sharedWithViewer)
  const hasLibraryEntries = libraryEntries.length > 0
  const hasDiscoveryGames = discoveryGames.length > 0
  const hasDiscoveryPeople = discoveryPeople.length > 0
  const hasDiscoveryContent = hasDiscoveryGames || hasDiscoveryPeople
  const hasPlayIntentPreviews = Boolean(state.playIntents && state.playIntents.intents.length > 0)
  const showSignedInOnboarding = isSignedIn && !hasLibraryEntries && !hasDiscoveryContent && !hasPlayIntentPreviews
  const availableDiscoveryServers = (state.discordServers?.servers ?? []).filter((server) => server.botPresent)
  const platformOptions = [...new Set([
    ...(selectedCatalogResult?.platformLabels ?? []),
    ...selectedPlatformLabels,
    ...defaultPlatformOptions
  ])]
  const selectedDiscoveryServerCount = availableDiscoveryServers.filter((server) => server.selected).length
  const noDiscoveryServersSelected = isSignedIn && availableDiscoveryServers.length > 0 && selectedDiscoveryServerCount === 0
  const discordProvider = state.auth?.providers.find((provider) => provider.id === 'discord') ?? null
  const discordGraph = state.session?.discordGraph ?? null
  const inviteUrl = resolveInviteUrl(typeof window === 'undefined' ? null : window.location.href)
  const selectedDiscoveryServers = availableDiscoveryServers.filter((server) => server.selected)
  const activeInviteServer = selectedDiscoveryServers.find((server) => server.id === inviteServerId) ?? selectedDiscoveryServers[0] ?? null
  const activeInviteServerId = activeInviteServer?.id ?? null
  const inviteMembers = inviteMembersState?.members ?? []
  const filteredInviteMembers = inviteMemberQuery.trim().length === 0
    ? inviteMembers
    : inviteMembers.filter((member) => {
        const normalizedQuery = inviteMemberQuery.trim().toLowerCase()
        return [member.displayName, member.username, member.appDisplayName, member.appHandle]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery))
      })
  const selectedInviteUsers = inviteMembers.filter((member) => selectedInviteUserIds.includes(member.id))
  const inviteText = inviteUrl
    ? buildInviteText(state.session?.user?.displayName ?? null, inviteUrl, {
        serverName: inviteMembersState?.serverName ?? activeInviteServer?.name,
        targetedNames: selectedInviteUsers.map((member) => member.displayName)
      })
    : null
  const canShareInvite = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const activePlayIntent = state.activePlayIntent
  const currentUsualAvailability = state.library?.usualAvailability ?? state.session?.user?.usualAvailability ?? null
  const usualAvailabilityChanged = usualAvailability.trim() !== (currentUsualAvailability ?? '')
  const usualAvailabilityButtonLabel = profileSaving
    ? 'Saving schedule...'
    : !usualAvailabilityChanged && currentUsualAvailability
      ? 'Saved'
      : 'Save usual schedule'
  const usualAvailabilityHelperText = usualAvailabilityChanged
    ? 'Save to update your profile default for games that do not have their own schedule override.'
    : currentUsualAvailability
      ? 'Used for games that do not have their own schedule override.'
      : 'No default schedule yet. Leave a game override blank to keep it unscheduled.'
  const editingLibraryEntry = libraryEntries.find((entry) => entry.id === editingLibraryEntryId) ?? null
  const canPostPlayIntent = libraryEntries.length > 0
  const parsedPlayIntentCustomDurationMinutes = parsePlayIntentDurationMinutes(playIntentCustomDurationInput)
  const parsedPlayIntentEndAt = parsePlayIntentEndAt(playIntentEndAtInput)
  const resolvedPlayIntentDurationMinutes = playIntentTimingMode === 'custom'
    ? parsedPlayIntentCustomDurationMinutes
    : playIntentTimingMode === 'end-time'
      ? parsedPlayIntentEndAt
        ? Math.ceil((parsedPlayIntentEndAt.getTime() - Date.now()) / (60 * 1000))
        : null
      : playIntentDurationMinutes
  const playIntentTimingValidationMessage = playIntentTimingMode === 'custom'
    ? parsedPlayIntentCustomDurationMinutes == null
      ? `Enter a whole-number length between ${minimumPlayIntentDurationMinutes} minutes and 24 hours.`
      : parsedPlayIntentCustomDurationMinutes < minimumPlayIntentDurationMinutes
        ? `Calls to play must stay live for at least ${minimumPlayIntentDurationMinutes} minutes.`
        : parsedPlayIntentCustomDurationMinutes > maximumPlayIntentDurationMinutes
          ? 'Calls to play can stay live for up to 24 hours.'
          : null
    : playIntentTimingMode === 'end-time'
      ? parsedPlayIntentEndAt == null
        ? 'Choose a valid end time.'
        : resolvedPlayIntentDurationMinutes == null || resolvedPlayIntentDurationMinutes < minimumPlayIntentDurationMinutes
          ? `Choose an end time at least ${minimumPlayIntentDurationMinutes} minutes from now.`
          : resolvedPlayIntentDurationMinutes > maximumPlayIntentDurationMinutes
            ? 'Calls to play can stay live for up to 24 hours.'
            : null
      : null
  const playIntentPreviewEndsAt = playIntentTimingMode === 'end-time'
    ? parsedPlayIntentEndAt
    : resolvedPlayIntentDurationMinutes == null
      ? null
      : new Date(Date.now() + resolvedPlayIntentDurationMinutes * 60 * 1000)
  const minPlayIntentEndAtInput = buildPlayIntentEndTimeInputValue(minimumPlayIntentDurationMinutes)
  const maxPlayIntentEndAtInput = buildPlayIntentEndTimeInputValue(maximumPlayIntentDurationMinutes)

  const applyAuthNotice = useCallback((status: string, reason: string | null) => {
    if (status === 'success') {
      setAuthNotice({
        tone: 'success',
        message: 'Signed in with Discord.'
      })
      return
    }

    if (reason === 'access_denied') {
      setAuthNotice({
        tone: 'danger',
        message: 'Discord sign-in was canceled. Game Is Up currently needs Discord server access to build your mutual-server discovery graph. Direct Discord friend import is still pending Discord approval.'
      })
      return
    }

    setAuthNotice({
      tone: 'danger',
      message: `Discord sign-in failed${reason ? `: ${reason}` : '.'}`
    })
  }, [])

  useEffect(() => {
    if (editingLibraryEntryId) {
      setGameSuggestions([])
      setGameSuggestionsLoading(false)
      return
    }

    const query = libraryTitle.trim()

    if (query.length < 2) {
      setGameSuggestions([])
      setGameSuggestionsLoading(false)
      return
    }

    let cancelled = false
    setGameSuggestionsLoading(true)

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/api/library/catalog?query=${encodeURIComponent(query)}`, {
            credentials: 'include'
          })
          const responseJson = await response.json()

          if (cancelled) {
            return
          }

          const parsed = gameSearchResponseSchema.parse(responseJson)
          setGameSuggestions(parsed.results)
        } catch {
          if (!cancelled) {
            setGameSuggestions([])
          }
        } finally {
          if (!cancelled) {
            setGameSuggestionsLoading(false)
          }
        }
      })()
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [editingLibraryEntryId, libraryTitle])

  useEffect(() => {
    setUsualAvailability(currentUsualAvailability ?? '')
  }, [currentUsualAvailability])

  useEffect(() => {
    if (!activePlayIntent) {
      setPlayIntentSelectionMode('library')
      setPlayIntentNotifyScope('discovery-and-friends')
      setPlayIntentTimingMode('preset')
      setPlayIntentDurationMinutes(120)
      setPlayIntentCustomDurationInput('120')
      setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(120))
      setPlayIntentNote('')
      setSelectedPlayIntentGameIds([])
      return
    }

    const durationMinutes = Math.max(
      30,
      Math.min(
        480,
        Math.round((new Date(activePlayIntent.windowEndsAt).getTime() - new Date(activePlayIntent.windowStartsAt).getTime()) / (60 * 1000))
      )
    )

    setPlayIntentSelectionMode(activePlayIntent.selectionMode)
    setPlayIntentNotifyScope(activePlayIntent.notifyScope)
    setPlayIntentTimingMode(playIntentPresetDurations.includes(durationMinutes as (typeof playIntentPresetDurations)[number]) ? 'preset' : 'end-time')
    setPlayIntentDurationMinutes(durationMinutes)
    setPlayIntentCustomDurationInput(String(durationMinutes))
    setPlayIntentEndAtInput(toLocalDateTimeInputValue(activePlayIntent.windowEndsAt))
    setPlayIntentNote(activePlayIntent.note)
    setSelectedPlayIntentGameIds(activePlayIntent.games.map((game) => game.id))
  }, [activePlayIntent])

  useEffect(() => {
    if (!editingLibraryEntryId || !libraryEditorRef.current) {
      return
    }

    window.requestAnimationFrame(() => {
      libraryEditorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    })
  }, [editingLibraryEntryId])

  function handleLibraryTitleChange(nextTitle: string) {
    setLibraryTitle(nextTitle)

    if (selectedCatalogResult && selectedCatalogResult.title !== nextTitle) {
      setSelectedCatalogResult(null)
    }
  }

  function togglePlatformLabel(platformLabel: string) {
    setSelectedPlatformLabels((current) =>
      current.includes(platformLabel)
        ? current.filter((entry) => entry !== platformLabel)
        : [...current, platformLabel]
    )
  }

  function togglePlayIntentGame(gameId: string) {
    setSelectedPlayIntentGameIds((current) =>
      current.includes(gameId)
        ? current.filter((entry) => entry !== gameId)
        : [...current, gameId]
    )
    setPlayIntentNotice(null)
  }

  function handleSelectSuggestion(result: GameSearchResult) {
    setSelectedCatalogResult(result)
    setLibraryTitle(result.title)
    setSelectedPlatformLabels([])
    setGameSuggestions([])
  }

  function resetLibraryForm() {
    setEditingLibraryEntryId(null)
    setLibraryTitle('')
    setSelectedPlatformLabels(['PC'])
    setLibraryAvailability('')
    setGameSuggestions([])
    setSelectedCatalogResult(null)
    setLibraryIntent('interested')
  }

  function handleEditLibraryEntry(entry: LibraryEntry) {
    setEditingLibraryEntryId(entry.id)
    setLibraryTitle(entry.title)
    setSelectedPlatformLabels(entry.platformLabels)
    setLibraryAvailability(entry.availabilitySource === 'game-specific' ? (entry.availability ?? '') : '')
    setGameSuggestions([])
    setSelectedCatalogResult(null)
    setLibraryIntent(entry.intent)
    setActionNotice({
      tone: 'neutral',
      message: `Editing ${entry.title} in the library form.`
    })
  }

  function handleCancelLibraryEdit() {
    resetLibraryForm()
  }

  const loadDashboard = useCallback(async () => {
    const requestInit = {
      credentials: 'include' as const
    }

    try {
      const [healthResponse, authResponse, sessionResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/health`, requestInit),
        fetch(`${apiBaseUrl}/api/auth/providers`, requestInit),
        fetch(`${apiBaseUrl}/api/auth/me`, requestInit)
      ])

      const [healthJson, authJson, sessionJson] = await Promise.all([
        healthResponse.json(),
        authResponse.json(),
        sessionResponse.json()
      ])

      const parsedSession = authSessionResponseSchema.parse(sessionJson)

      const [discoveryResponse, playIntentsResponse, libraryResponse, currentPlayIntentResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/discovery/feed`, requestInit),
        fetch(`${apiBaseUrl}/api/play-intents/feed`, requestInit),
        parsedSession.authenticated ? fetch(`${apiBaseUrl}/api/library/me`, requestInit) : Promise.resolve(null),
        parsedSession.authenticated ? fetch(`${apiBaseUrl}/api/play-intents/me`, requestInit) : Promise.resolve(null)
      ])

      const [discoveryJson, playIntentsJson] = await Promise.all([
        discoveryResponse.json(),
        playIntentsResponse.json()
      ])

      const discordServersResponse = parsedSession.authenticated ? await fetch(`${apiBaseUrl}/api/discord-servers/me`, requestInit) : null

      let library: LibraryResponse | null = null
      let activePlayIntentState: ActivePlayIntent | null = null
      let discordServers: DiscordServerPreferencesResponse | null = null

      if (libraryResponse) {
        const libraryJson = await libraryResponse.json()
        library = libraryResponseSchema.parse(libraryJson)
      }

      if (currentPlayIntentResponse) {
        const currentPlayIntentJson = (await currentPlayIntentResponse.json()) as PlayIntentCurrentResponse
        activePlayIntentState = playIntentCurrentResponseSchema.parse(currentPlayIntentJson).activeIntent
      }

      if (discordServersResponse) {
        const discordServersJson = await discordServersResponse.json()
        discordServers = discordServerPreferencesResponseSchema.parse(discordServersJson)
      }

      setState({
        activePlayIntent: activePlayIntentState,
        session: parsedSession,
        health: healthResponseSchema.parse(healthJson),
        auth: authProvidersResponseSchema.parse(authJson),
        discordServers,
        discovery: discoveryFeedSchema.parse(discoveryJson),
        playIntents: playIntentFeedSchema.parse(playIntentsJson),
        library,
        error: null
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  }, [])

  const completeMobileAuth = useCallback(async (handoff: string) => {
    const response = await fetch(`${apiBaseUrl}/api/auth/mobile-complete`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ handoff })
    })

    if (!response.ok) {
      const responseBody = (await response.json()) as { error?: string }
      throw new Error(responseBody.error ?? 'Unable to finish mobile sign-in.')
    }
  }, [])

  const handleAuthRedirect = useCallback(async (urlString: string, options?: { clearBrowserUrl?: boolean; closeBrowser?: boolean }) => {
    const url = new URL(urlString)
    const params = url.searchParams
    const auth = params.get('auth')
    const status = params.get('status')
    const reason = params.get('reason')
    const handoff = params.get('handoff')

    if (auth !== 'discord' || !status) {
      return false
    }

    try {
      if (status === 'success' && handoff) {
        await completeMobileAuth(handoff)
        await loadDashboard()
      }

      applyAuthNotice(status, reason)
    } catch (error) {
      setAuthNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to finish mobile sign-in.'
      })
    } finally {
      if (options?.closeBrowser && isNativeApp) {
        try {
          await Browser.close()
        } catch {
          // Browser.close is not supported in every native path.
        }
      }

      if (options?.clearBrowserUrl) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }

    return true
  }, [applyAuthNotice, completeMobileAuth, isNativeApp, loadDashboard])

  useEffect(() => {
    void handleAuthRedirect(window.location.href, { clearBrowserUrl: true })
  }, [handleAuthRedirect])

  useEffect(() => {
    if (!isNativeApp) {
      return
    }

    let listener: { remove: () => Promise<void> } | null = null

    const handleNativeAuthUrl = async (urlString: string) => {
      if (lastHandledAuthUrlRef.current === urlString) {
        return
      }

      lastHandledAuthUrlRef.current = urlString
      await handleAuthRedirect(urlString, { closeBrowser: true })
    }

    const registerListener = async () => {
      listener = await CapacitorApp.addListener('appUrlOpen', (event) => {
        const url = new URL(event.url)

        if (url.protocol !== 'gameisup:' || url.host !== 'auth') {
          return
        }

        void handleNativeAuthUrl(event.url)
      })

      const launchUrl = await CapacitorApp.getLaunchUrl()

      if (launchUrl?.url) {
        const url = new URL(launchUrl.url)

        if (url.protocol === 'gameisup:' && url.host === 'auth') {
          await handleNativeAuthUrl(launchUrl.url)
        }
      }
    }

    void registerListener()

    return () => {
      if (listener) {
        void listener.remove()
      }
    }
  }, [handleAuthRedirect, isNativeApp])

  useEffect(() => {
    if (!state.error) {
      return
    }

    let cancelled = false
    let pollInFlight = false
    const requestInit = {
      credentials: 'include' as const
    }

    const pollApiHealth = async () => {
      if (pollInFlight) {
        return
      }

      pollInFlight = true

      try {
        const response = await fetch(`${apiBaseUrl}/api/health`, requestInit)

        if (!response.ok) {
          return
        }

        const healthJson = await response.json()
        healthResponseSchema.parse(healthJson)

        if (!cancelled) {
          await loadDashboard()
        }
      } catch {
        return
      } finally {
        pollInFlight = false
      }
    }

    const intervalId = window.setInterval(() => {
      void pollApiHealth()
    }, apiReconnectPollMs)

    void pollApiHealth()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [loadDashboard, state.error])

  async function handleLogout() {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    })

    window.location.reload()
  }

  async function handleDiscordLogin() {
    if (isNativeApp) {
      await Browser.open({
        url: `${apiBaseUrl}/api/auth/discord/login?returnTo=${encodeURIComponent(mobileAuthRedirectUrl)}`
      })
      return
    }

    window.location.assign(`${apiBaseUrl}/api/auth/discord/login`)
  }

  async function handleAddLibraryEntry() {
    const title = libraryTitle.trim()
    const platformLabels = [...new Set(selectedPlatformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
    const isEditingLibraryEntry = Boolean(editingLibraryEntryId)

    if (!title || platformLabels.length === 0) {
      setActionNotice({
        tone: 'danger',
        message: 'Add a game title and choose at least one platform before saving to your library.'
      })
      return
    }

    setLibrarySaving(true)
    setActionNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/library/me`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          platformLabels,
          intent: libraryIntent,
          availability: libraryAvailability.trim() || undefined,
          catalogMatch: selectedCatalogResult
            ? {
                source: selectedCatalogResult.source,
                sourceId: selectedCatalogResult.sourceId,
                title: selectedCatalogResult.title,
                coverUrl: selectedCatalogResult.coverUrl,
                platformLabels: selectedCatalogResult.platformLabels
              }
            : undefined
        })
      })

      const responseBody = (await response.json()) as LibraryResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to add that game right now.'
        })
        return
      }

      libraryResponseSchema.parse(responseBody)
      resetLibraryForm()
      setActionNotice({
        tone: 'success',
        message: isEditingLibraryEntry ? `${title} was updated in your library.` : `${title} was added to your library.`
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to add that game right now.'
      })
    } finally {
      setLibrarySaving(false)
    }
  }

  async function handleSaveUsualAvailability() {
    setProfileSaving(true)
    setActionNotice(null)
    setProfileNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/profile/me`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usualAvailability: usualAvailability.trim() || undefined
        })
      })

      const responseBody = (await response.json()) as UserProfileResponse | { error?: string }

      if (!response.ok) {
        setProfileNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to update your usual play schedule right now.'
        })
        return
      }

      const parsedProfile = userProfileResponseSchema.parse(responseBody)
      setState((current) => ({
        ...current,
        session: current.session?.authenticated && current.session.user
          ? {
              ...current.session,
              user: {
                ...current.session.user,
                usualAvailability: parsedProfile.usualAvailability
              }
            }
          : current.session,
        library: current.library
          ? {
              ...current.library,
              usualAvailability: parsedProfile.usualAvailability
            }
          : current.library
      }))
      setProfileNotice({
        tone: 'success',
        message: usualAvailability.trim()
          ? 'Saved as your default play schedule.'
          : 'Cleared your default play schedule.'
      })
      void loadDashboard()
    } catch (error) {
      setProfileNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update your usual play schedule right now.'
      })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleSavePlayIntent() {
    if (!canPostPlayIntent) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Add at least one game to your library before posting a call to play.'
      })
      return
    }

    if (playIntentSelectionMode === 'subset' && selectedPlayIntentGameIds.length === 0) {
      setPlayIntentNotice({
        tone: 'danger',
        message: 'Pick at least one game before posting a selected-games call to play.'
      })
      return
    }

    if (playIntentTimingValidationMessage) {
      setPlayIntentNotice({
        tone: 'danger',
        message: playIntentTimingValidationMessage
      })
      return
    }

    const timingPayload = playIntentTimingMode === 'end-time'
      ? { endAt: parsedPlayIntentEndAt?.toISOString() }
      : { durationMinutes: resolvedPlayIntentDurationMinutes ?? playIntentDurationMinutes }

    setPlayIntentSaving(true)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/play-intents/me`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selectionMode: playIntentSelectionMode,
          notifyScope: playIntentNotifyScope,
          ...timingPayload,
          note: playIntentNote.trim() || undefined,
          gameIds: playIntentSelectionMode === 'subset' ? selectedPlayIntentGameIds : []
        })
      })

      const responseBody = (await response.json()) as UpsertPlayIntentResponse | { error?: string }

      if (!response.ok) {
        setPlayIntentNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to post your call to play right now.'
        })
        return
      }

      const parsedResponse = upsertPlayIntentResponseSchema.parse(responseBody)
      setState((current) => ({
        ...current,
        activePlayIntent: parsedResponse.activeIntent
      }))
      setPlayIntentNotice({
        tone: 'success',
        message: parsedResponse.notifiedFriendCount > 0
          ? `Your call to play is live. ${parsedResponse.notifiedFriendCount} overlapping friend${parsedResponse.notifiedFriendCount === 1 ? '' : 's'} were notified.`
          : 'Your call to play is live. No overlapping friends matched it yet.'
      })
      void loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to post your call to play right now.'
      })
    } finally {
      setPlayIntentSaving(false)
    }
  }

  async function handleClearPlayIntent() {
    setPlayIntentSaving(true)
    setPlayIntentNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/play-intents/me`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setPlayIntentNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to clear your call to play right now.'
        })
        return
      }

      setState((current) => ({
        ...current,
        activePlayIntent: null
      }))
      setPlayIntentNotice({
        tone: 'success',
        message: 'Your call to play is no longer live.'
      })
      void loadDashboard()
    } catch (error) {
      setPlayIntentNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to clear your call to play right now.'
      })
    } finally {
      setPlayIntentSaving(false)
    }
  }

  async function handleRemoveLibraryEntry(entryId: string) {
    setRemovingLibraryEntryId(entryId)
    setActionNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/library/me/${entryId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setActionNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to remove that game right now.'
        })
        return
      }

      setActionNotice({
        tone: 'success',
        message: 'Removed that game from your library.'
      })

      if (entryId === editingLibraryEntryId) {
        resetLibraryForm()
      }

      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to remove that game right now.'
      })
    } finally {
      setRemovingLibraryEntryId(null)
    }
  }

  async function handleToggleFriend(target: FriendTarget) {
    setFriendPendingId(target.id)
    setActionNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/friends/${target.id}`, {
        method: target.friendEligible ? 'POST' : 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const responseBody = (await response.json()) as { error?: string }
        setActionNotice({
          tone: 'danger',
          message: responseBody.error ?? 'Unable to update friends right now.'
        })
        return
      }

      setActionNotice({
        tone: 'success',
        message: target.friendEligible
          ? `${target.displayName} was added to your friends list.`
          : `${target.displayName} was removed from your friends list.`
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update friends right now.'
      })
    } finally {
      setFriendPendingId(null)
    }
  }

  async function handleToggleDiscordServer(serverId: string, nextSelected: boolean) {
    setServerPreferencePendingId(serverId)
    setActionNotice(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/discord-servers/me/${serverId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selected: nextSelected
        })
      })

      const responseBody = (await response.json()) as DiscordServerPreferencesResponse | { error?: string }

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message:
            typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
              ? responseBody.error
              : 'Unable to update this server setting right now.'
        })
        return
      }

      discordServerPreferencesResponseSchema.parse(responseBody)
      setActionNotice({
        tone: 'success',
        message: nextSelected ? 'That server will now help you find players.' : 'That server will no longer be used to find players.'
      })
      await loadDashboard()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update this server setting right now.'
      })
    } finally {
      setServerPreferencePendingId(null)
    }
  }

  async function handleCopyInvite() {
    setActionNotice(null)

    if (!inviteText) {
      setActionNotice({
        tone: 'danger',
        message: 'This build does not have a public invite link available right now.'
      })
      return
    }

    if (!navigator.clipboard?.writeText) {
      setActionNotice({
        tone: 'danger',
        message: 'Clipboard access is not available here. Use the invite link field to copy it manually.'
      })
      return
    }

    try {
      await navigator.clipboard.writeText(inviteText)
      setActionNotice({
        tone: 'success',
        message: 'Invite text copied. Send it wherever you want.'
      })
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to copy the invite right now.'
      })
    }
  }

  async function handleShareInvite() {
    setActionNotice(null)

    if (!inviteUrl || !inviteText) {
      setActionNotice({
        tone: 'danger',
        message: 'This build does not have a public invite link available right now.'
      })
      return
    }

    if (typeof navigator.share !== 'function') {
      await handleCopyInvite()
      return
    }

    try {
      await navigator.share({
        title: 'Join me on Game Is Up',
        text: inviteText,
        url: inviteUrl
      })
      setActionNotice({
        tone: 'success',
        message: 'Invite ready to send.'
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to share the invite right now.'
      })
    }
  }

  async function handleSendBotInvites() {
    setActionNotice(null)
    setInviteSendSummary(null)

    if (!activeInviteServerId || selectedInviteUserIds.length === 0 || !inviteUrl) {
      setActionNotice({
        tone: 'danger',
        message: 'Choose a bot-enabled server, select at least one Discord member, and make sure the invite link is available first.'
      })
      return
    }

    setInviteSending(true)

    try {
      const response = await fetch(`${apiBaseUrl}/api/discord-servers/me/${activeInviteServerId}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inviteUrl,
          memberIds: selectedInviteUserIds
        })
      })

      const responseJson = await response.json() as SendDiscordServerInvitesResponse | { error?: string }

      if (!response.ok) {
        throw new Error(typeof responseJson === 'object' && responseJson && 'error' in responseJson && typeof responseJson.error === 'string'
          ? responseJson.error
          : 'Unable to send bot invites right now.')
      }

      const parsed = sendDiscordServerInvitesResponseSchema.parse(responseJson)
      const failedRecipients = parsed.results.filter((result) => result.status === 'failed')

      setInviteSendSummary(parsed)

      setActionNotice({
        tone: failedRecipients.length === 0 ? 'success' : 'neutral',
        message: failedRecipients.length === 0
          ? `Bot sent ${parsed.sentCount} invite${parsed.sentCount === 1 ? '' : 's'} from ${parsed.serverName}.`
          : `Bot sent ${parsed.sentCount} invite${parsed.sentCount === 1 ? '' : 's'} from ${parsed.serverName}. ${parsed.failedCount} failed${failedRecipients[0]?.error ? `: ${failedRecipients[0].displayName} (${failedRecipients[0].error})` : '.'}`
      })
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to send bot invites right now.'
      })
      setInviteSendSummary(null)
    } finally {
      setInviteSending(false)
    }
  }

  function handleToggleInviteUser(userId: string) {
    setInviteSendSummary(null)
    setSelectedInviteUserIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }

  function handleRetryInviteMembers() {
    setInviteMembersReloadVersion((current) => current + 1)
  }

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (selectedDiscoveryServers.length === 0) {
      if (inviteServerId !== null) {
        setInviteServerId(null)
      }
      return
    }

    if (!selectedDiscoveryServers.some((server) => server.id === inviteServerId)) {
      const firstSelectedServer = selectedDiscoveryServers[0]

      if (firstSelectedServer) {
        setInviteServerId(firstSelectedServer.id)
      }
    }
  }, [inviteServerId, selectedDiscoveryServers])

  useEffect(() => {
    if (!isSignedIn || !activeInviteServerId) {
      setInviteMembersState(null)
      setInviteMembersNotice(null)
      setInviteMembersLoading(false)
      setSelectedInviteUserIds([])
      setInviteMemberQuery('')
      setInviteSendSummary(null)
      return
    }

    let cancelled = false
    setInviteMembersLoading(true)
    setInviteMembersNotice(null)
    setInviteMembersState(null)
    setSelectedInviteUserIds([])
    setInviteMemberQuery('')
    setInviteSendSummary(null)

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/discord-servers/me/${activeInviteServerId}/members`, {
          credentials: 'include'
        })
        const responseJson = await response.json() as DiscordServerMembersResponse | { error?: string }

        if (cancelled) {
          return
        }

        if (!response.ok) {
          throw new Error(typeof responseJson === 'object' && responseJson && 'error' in responseJson && typeof responseJson.error === 'string'
            ? responseJson.error
            : 'Unable to load Discord members right now.')
        }

        setInviteMembersState(discordServerMembersResponseSchema.parse(responseJson))
      } catch (error) {
        if (cancelled) {
          return
        }

        setInviteMembersNotice({
          tone: 'danger',
          message: error instanceof Error ? error.message : 'Unable to load Discord members right now.'
        })
      } finally {
        if (!cancelled) {
          setInviteMembersLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeInviteServerId, inviteMembersReloadVersion, isSignedIn])

  return (
    <CssVarsProvider theme={theme} defaultMode="dark">
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 5 }
        }}
      >
        <Stack spacing={4} sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Sheet
            variant="plain"
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 'lg',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background:
                'linear-gradient(135deg, rgba(10, 16, 31, 0.94), rgba(19, 28, 46, 0.78))',
              boxShadow: 'xl'
            }}
          >
            <Stack spacing={2}>
              <Chip size="lg" color="primary" variant="soft" sx={{ alignSelf: 'flex-start' }}>
                Discovery-first PWA scaffold
              </Chip>
              <Typography level="h1" sx={{ fontSize: { xs: '2.4rem', md: '4rem' } }}>
                Find people waiting to play the same games as you.
              </Typography>
              <Typography level="body-lg" sx={{ color: 'neutral.200' }}>
                This first implementation focuses on overlap, friends, and timely play intent. The Android app will wrap this web experience through Capacitor so the same interface and product logic stay shared.
              </Typography>
            </Stack>
          </Sheet>

          {showSignedInOnboarding ? (
            <EmptyStateCard
              title="Your account is live, but it does not have any game data yet"
              body="Right now the discovery and play-intent sections are driven entirely by your own library overlap and friends list. Since your freshly created account has not added games, friends, or availability yet, those sections collapse to empty results instead of showing the seeded demo user experience."
              chips={['Add library flow live', 'Friends unlock overlap', 'Play intent needs games first']}
            />
          ) : null}

          {actionNotice ? (
            <Card color={actionNotice.tone} variant="soft">
              <Typography level="body-md">{actionNotice.message}</Typography>
            </Card>
          ) : null}

          <Tabs
            value={activeTab}
            onChange={(_, value) => {
              if (value) {
                setActiveTab(value as DashboardTab)
              }
            }}
            sx={{
              '--Tabs-gap': '1rem',
              '--Tab-indicatorThickness': '0px',
              backgroundColor: 'transparent'
            }}
          >
            <TabList
              disableUnderline
              sx={{
                p: 1,
                gap: 1,
                borderRadius: 'xl',
                flexWrap: 'wrap',
                backgroundColor: 'rgba(11, 16, 32, 0.82)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(18px)',
                boxShadow: 'lg'
              }}
            >
              <Tab value="overview" sx={dashboardTabSx}>
                Overview
              </Tab>
              <Tab value="library" sx={dashboardTabSx}>
                Library
              </Tab>
              <Tab value="play" sx={dashboardTabSx}>
                Play
              </Tab>
              <Tab value="discovery" sx={dashboardTabSx}>
                Discovery
              </Tab>
            </TabList>

            <TabPanel value="overview" sx={{ px: 0, pt: 3, backgroundColor: 'transparent' }}>
              <Stack spacing={3}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <Card variant="soft" sx={{ flex: 1, p: 3 }}>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      API status
                    </Typography>
                    <Typography level="body-md">
                      {state.health ? `${state.health.service} is ${state.health.status}` : 'Waiting for API...'}
                    </Typography>
                  </Card>
                  <Card variant="soft" sx={{ flex: 1, p: 3 }}>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Auth status
                    </Typography>
                    {state.session?.authenticated && state.session.user ? (
                      <Stack spacing={1.5}>
                        <Typography level="body-md">
                          Signed in as {state.session.user.displayName} ({state.session.user.handle})
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          <Chip color="success">{state.session.user.authProvider}</Chip>
                          {state.session.user.email ? <Chip variant="outlined">{state.session.user.email}</Chip> : null}
                        </Stack>
                        <Button variant="outlined" color="neutral" onClick={() => void handleLogout()}>
                          Sign out
                        </Button>
                      </Stack>
                    ) : (
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {state.auth?.providers.map((provider) => (
                            <Chip key={provider.id} color={provider.enabled ? 'success' : 'neutral'}>
                              {provider.label}
                            </Chip>
                          )) ?? <Typography level="body-md">Waiting for auth config...</Typography>}
                        </Stack>
                        <Button
                          color="primary"
                          disabled={!state.auth?.providers.find((provider) => provider.id === 'discord')?.enabled}
                          onClick={handleDiscordLogin}
                        >
                          Sign in with Discord
                        </Button>
                        {discordProvider ? (
                          <Stack spacing={0.75}>
                            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                              Sign-in currently requests {discordProvider.requestedScopes.map(formatScopeLabel).join(', ')}.
                              Discord server access lets Game Is Up look for other app users from the servers you choose later.
                            </Typography>
                            {discordProvider.gatedScopes.length > 0 ? (
                              <Typography level="body-sm" sx={{ color: 'warning.300' }}>
                                Direct Discord friend import needs {discordProvider.gatedScopes.map(formatScopeLabel).join(', ')} and is blocked behind Discord approval for now.
                              </Typography>
                            ) : null}
                          </Stack>
                        ) : null}
                        {authNotice ? (
                          <Card color={authNotice.tone} variant="soft">
                            <Typography level="body-sm">{authNotice.message}</Typography>
                          </Card>
                        ) : null}
                      </Stack>
                    )}
                  </Card>
                  <Card variant="soft" sx={{ flex: 1, p: 3 }}>
                    <Typography level="title-lg" sx={{ mb: 1 }}>
                      Validation
                    </Typography>
                    <Typography level="body-md">
                      ESLint, TypeScript, and Prisma validation are wired at the root workspace level.
                    </Typography>
                  </Card>
                </Stack>

                <Card variant="soft" sx={{ p: 3 }}>
                  <Stack spacing={1.25}>
                    <Typography level="title-lg">Discovery graph</Typography>
                    <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                      Discovery currently runs on selected mutual Discord servers plus in-app friends. Direct Discord friend import is designed in, but it cannot be activated until Discord approves relationships.read.
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      Shared Discord servers do not reveal everyone in those servers. You only see people who also signed into Game Is Up.
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      <Chip color="primary" variant="soft">
                        Mutual servers active
                      </Chip>
                      <Chip color="success" variant="soft">
                        In-app friends active
                      </Chip>
                      <Chip color="warning" variant="outlined">
                        Discord friends pending approval
                      </Chip>
                    </Stack>
                    {discordGraph ? (
                      <Stack spacing={0.5}>
                        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                          Granted Discord scopes: {discordGraph.grantedScopes.length > 0 ? discordGraph.grantedScopes.map(formatScopeLabel).join(', ') : 'none yet'}.
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                          Guild sync: {discordGraph.guildSync.active ? 'active' : 'not active'}{discordGraph.guildSync.lastSyncedAt ? `, last synced ${new Date(discordGraph.guildSync.lastSyncedAt).toLocaleString()}` : ''}.
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                          Relationship sync: {discordGraph.relationshipSync.status.replace(/-/g, ' ')}.
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                          Activity tracking: {discordGraph.activityTracking.botConfigured
                            ? discordGraph.activityTracking.botConnected
                              ? `connected across ${discordGraph.activityTracking.botGuildCount} bot server${discordGraph.activityTracking.botGuildCount === 1 ? '' : 's'}`
                              : 'configured but not connected'
                            : 'not configured'}.
                        </Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                          Shared bot visibility: {discordGraph.activityTracking.sharesServerWithBot ? 'yes' : 'not yet'}.
                        </Typography>
                        {discordGraph.activityTracking.currentActivity ? (
                          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                            Current observed Discord activity: {discordGraph.activityTracking.currentActivity.title}.
                          </Typography>
                        ) : null}
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          {discordGraph.activityTracking.note}
                        </Typography>
                      </Stack>
                    ) : (
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        Sign in with Discord to sync mutual servers and start discovery.
                      </Typography>
                    )}
                  </Stack>
                </Card>

                {isSignedIn ? (
                  <Stack spacing={2}>
                    <Typography level="h2">Discovery servers</Typography>
                    <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                      Choose which Discord servers should count for mutual-user discovery. Only servers where the bot is present can be used for discovery and invite browsing.
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      Server counts only include other Game Is Up users. People in Discord who have never opened the app will not appear here yet.
                    </Typography>
                    {availableDiscoveryServers.length > 0 ? (
                      <Stack spacing={1.5}>
                        {availableDiscoveryServers.map((server) => (
                          <Card key={server.id} variant="soft" sx={{ p: 2.5 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                              <Stack spacing={0.5}>
                                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
                                  <Typography level="title-md">{server.name}</Typography>
                                  <Chip size="sm" color="success" variant="soft">
                                    Bot present
                                  </Chip>
                                </Stack>
                                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                  {server.knownUserCount > 0
                                    ? `${server.knownUserCount} other app user${server.knownUserCount === 1 ? '' : 's'} currently share this server.`
                                    : 'No other app users from this server are known yet.'}
                                </Typography>
                              </Stack>
                              <Button
                                size="sm"
                                variant={server.selected ? 'solid' : 'outlined'}
                                color={server.selected ? 'primary' : 'neutral'}
                                disabled={serverPreferencePendingId === server.id}
                                onClick={() => void handleToggleDiscordServer(server.id, !server.selected)}
                              >
                                {serverPreferencePendingId === server.id
                                  ? 'Saving...'
                                  : server.selected
                                    ? 'Used to find players'
                                    : 'Use to find players'}
                              </Button>
                            </Stack>
                          </Card>
                        ))}
                      </Stack>
                    ) : state.discordServers?.servers.length ? (
                      <EmptyStateCard
                        title="No bot-enabled servers available"
                        body="Your Discord servers are synced, but none currently have the Game Is Up bot installed. Install the bot in one shared server to use server-based player finding and member invites."
                        chips={['Bot required for discovery', 'Synced memberships found', 'Install bot in a shared server']}
                      />
                    ) : (
                      <EmptyStateCard
                        title="No Discord servers synced yet"
                        body="Your current session does not have any synced Discord server memberships yet. Sign out and sign back in with Discord to grant server access and refresh the list."
                        chips={['Discord OAuth', 'Guild sync on sign-in', 'Discovery filters by selected servers']}
                      />
                    )}
                  </Stack>
                ) : null}

                {isSignedIn ? (
                  <Card variant="soft" sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography level="title-lg">Invite users from your servers</Typography>
                        <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.75 }}>
                          Choose one of your selected bot-enabled player-finding servers, browse its Discord members, and have the bot DM the people you want.
                        </Typography>
                      </Box>
                      {inviteUrl ? (
                        <Input
                          value={inviteUrl}
                          readOnly
                          endDecorator={(
                            <Link href={inviteUrl} target="_blank" rel="noreferrer">
                              Open
                            </Link>
                          )}
                        />
                      ) : (
                        <Card color="warning" variant="soft">
                          <Typography level="body-sm">
                            This build does not have a public invite link configured yet.
                          </Typography>
                        </Card>
                      )}
                      {selectedDiscoveryServers.length > 0 ? (
                        <Stack spacing={1.5}>
                          <Box>
                            <Typography level="body-sm" sx={{ color: 'neutral.300', mb: 0.75 }}>
                              Pick a server
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                              {selectedDiscoveryServers.map((server) => (
                                <Button
                                  key={server.id}
                                  size="sm"
                                  variant={activeInviteServer?.id === server.id ? 'solid' : 'outlined'}
                                  color={activeInviteServer?.id === server.id ? 'primary' : 'neutral'}
                                  onClick={() => {
                                    setInviteServerId(server.id)
                                  }}
                                >
                                  {server.name}
                                </Button>
                              ))}
                            </Stack>
                          </Box>
                          {activeInviteServer ? (
                            <Stack spacing={1.25}>
                              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                                Browse members in {activeInviteServer.name}
                              </Typography>
                              <Input
                                placeholder="Search Discord members"
                                value={inviteMemberQuery}
                                onChange={(event) => setInviteMemberQuery(event.target.value)}
                              />
                              {inviteMembersLoading ? (
                                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                  Loading Discord members...
                                </Typography>
                              ) : inviteMembersNotice ? (
                                <Card color={inviteMembersNotice.tone} variant="soft">
                                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                                    <Typography level="body-sm">{inviteMembersNotice.message}</Typography>
                                    <Button size="sm" variant="outlined" color="neutral" onClick={handleRetryInviteMembers}>
                                      Retry
                                    </Button>
                                  </Stack>
                                </Card>
                              ) : filteredInviteMembers.length > 0 ? (
                                <Stack spacing={1} sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.5 }}>
                                  {filteredInviteMembers.map((member) => (
                                    <Sheet
                                      key={member.id}
                                      variant="outlined"
                                      sx={{
                                        p: 1.25,
                                        borderRadius: 'md',
                                        backgroundColor: selectedInviteUserIds.includes(member.id) ? 'rgba(20, 136, 106, 0.14)' : 'transparent'
                                      }}
                                    >
                                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                                        <Box>
                                          <Typography level="title-sm">{member.displayName}</Typography>
                                          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                            @{member.username}
                                            {member.isAppUser && member.appHandle ? ` • Game Is Up: @${member.appHandle}` : ''}
                                          </Typography>
                                        </Box>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                                          <Chip size="sm" color={member.isAppUser ? 'success' : 'neutral'} variant={member.isAppUser ? 'soft' : 'outlined'}>
                                            {member.isAppUser ? 'On Game Is Up' : 'Discord only'}
                                          </Chip>
                                          <Button
                                            size="sm"
                                            variant={selectedInviteUserIds.includes(member.id) ? 'solid' : 'outlined'}
                                            color={selectedInviteUserIds.includes(member.id) ? 'primary' : 'neutral'}
                                            onClick={() => handleToggleInviteUser(member.id)}
                                          >
                                            {selectedInviteUserIds.includes(member.id) ? 'Selected' : 'Select'}
                                          </Button>
                                        </Stack>
                                      </Stack>
                                    </Sheet>
                                  ))}
                                </Stack>
                              ) : inviteMemberQuery.trim().length > 0 ? (
                                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                  No server members match that search.
                                </Typography>
                              ) : (
                                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                  No Discord members are available to browse for this server yet.
                                </Typography>
                              )}
                            </Stack>
                          ) : null}
                        </Stack>
                      ) : (
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          Turn on at least one server where the bot is present to browse and target specific members.
                        </Typography>
                      )}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        <Button
                          color="primary"
                          disabled={!inviteUrl || selectedInviteUserIds.length === 0 || inviteSending}
                          onClick={() => void handleSendBotInvites()}
                        >
                          {inviteSending ? 'Sending bot invites...' : 'Send bot invites'}
                        </Button>
                        <Button variant="outlined" color="neutral" disabled={!inviteUrl} onClick={() => void handleCopyInvite()}>
                          Copy fallback message
                        </Button>
                        {canShareInvite ? (
                          <Button variant="outlined" color="neutral" disabled={!inviteUrl} onClick={() => void handleShareInvite()}>
                            Share fallback message
                          </Button>
                        ) : null}
                      </Stack>
                      <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                        The bot will DM the selected Discord members directly. If a DM fails because the user blocks bot DMs, you can still use the fallback copy/share actions.
                      </Typography>
                      {inviteSendSummary ? (
                        <Card color={inviteSendSummary.failedCount > 0 ? 'warning' : 'success'} variant="soft">
                          <Stack spacing={1.25}>
                            <Typography level="title-sm">
                              Delivery summary: {inviteSendSummary.sentCount} sent, {inviteSendSummary.failedCount} failed
                            </Typography>
                            <Stack spacing={1}>
                              {inviteSendSummary.results.map((result) => (
                                <Sheet
                                  key={result.memberId}
                                  variant="outlined"
                                  sx={{
                                    p: 1.25,
                                    borderRadius: 'md',
                                    backgroundColor: 'rgba(255, 255, 255, 0.02)'
                                  }}
                                >
                                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                                    <Box>
                                      <Typography level="title-sm">{result.displayName}</Typography>
                                      <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                        @{result.username}
                                      </Typography>
                                      {result.error ? (
                                        <Typography level="body-sm" sx={{ color: 'warning.300', mt: 0.5 }}>
                                          {result.error}
                                        </Typography>
                                      ) : null}
                                    </Box>
                                    <Chip size="sm" color={result.status === 'sent' ? 'success' : 'warning'} variant={result.status === 'sent' ? 'soft' : 'outlined'}>
                                      {result.status === 'sent' ? 'Sent' : 'Failed'}
                                    </Chip>
                                  </Stack>
                                </Sheet>
                              ))}
                            </Stack>
                          </Stack>
                        </Card>
                      ) : null}
                    </Stack>
                  </Card>
                ) : null}
              </Stack>
            </TabPanel>

            <TabPanel value="library" sx={{ px: 0, pt: 3, backgroundColor: 'transparent' }}>
              {isSignedIn ? (
                <Stack spacing={2}>
                  <Typography level="h2">Your library</Typography>
                  <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                    Add a few games to your library so discovery, friends, and play-intent matching have something real to work from.
                  </Typography>
                  <Card variant="soft" sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography level="title-md">When do you usually play?</Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
                          Set one default schedule at the user level. Individual games can still carry their own override when they differ.
                        </Typography>
                      </Box>
                      <Input
                        placeholder="Example: Weeknights after 8pm"
                        value={usualAvailability}
                        onChange={(event) => {
                          setUsualAvailability(event.target.value)
                          setProfileNotice(null)
                        }}
                      />
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <Button color="primary" disabled={profileSaving || !usualAvailabilityChanged} onClick={() => void handleSaveUsualAvailability()}>
                          {usualAvailabilityButtonLabel}
                        </Button>
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          {usualAvailabilityHelperText}
                        </Typography>
                      </Stack>
                      {profileNotice ? (
                        <Card
                          color={profileNotice.tone}
                          variant="soft"
                          sx={{
                            p: 1.5,
                            gap: 0.5
                          }}
                        >
                          <Typography level="body-sm">{profileNotice.message}</Typography>
                        </Card>
                      ) : null}
                    </Stack>
                  </Card>
                  <Card
                    ref={libraryEditorRef}
                    variant="soft"
                    sx={{
                      p: 3,
                      border: editingLibraryEntry ? '1px solid rgba(78, 240, 183, 0.45)' : '1px solid transparent',
                      boxShadow: editingLibraryEntry ? '0 0 0 1px rgba(78, 240, 183, 0.16)' : 'none',
                      transition: 'border-color 180ms ease, box-shadow 180ms ease'
                    }}
                  >
                    <Stack spacing={2}>
                      {editingLibraryEntry ? (
                        <Card variant="outlined" sx={{ p: 2, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                            <Box>
                              <Typography level="title-sm">Library editor: {editingLibraryEntry.title}</Typography>
                              <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                You are editing this entry in the form below. Update platforms, intent, or the schedule override here.
                              </Typography>
                            </Box>
                            <Button size="sm" variant="outlined" color="neutral" onClick={handleCancelLibraryEdit}>
                              Cancel
                            </Button>
                          </Stack>
                        </Card>
                      ) : null}
                      <Stack spacing={1}>
                        <Typography level="title-sm">Game title</Typography>
                        <Input
                          placeholder={editingLibraryEntry ? 'Game title is fixed while editing this entry' : 'Start typing a game title'}
                          value={libraryTitle}
                          disabled={Boolean(editingLibraryEntry)}
                          onChange={(event) => handleLibraryTitleChange(event.target.value)}
                        />
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          {editingLibraryEntry
                            ? 'Edit the other options here without losing the existing entry.'
                            : 'Suggestions come from the synced catalog and RAWG. You can keep typing for a manual save if the right match does not appear.'}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                          External catalog data via{' '}
                          <Link href="https://rawg.io" target="_blank" rel="noreferrer">
                            RAWG
                          </Link>
                          .
                        </Typography>
                        {libraryTitle.trim().length >= 2 && !selectedCatalogResult && !editingLibraryEntry ? (
                          <Sheet
                            variant="soft"
                            sx={{
                              mt: 1,
                              borderRadius: 'md',
                              border: '1px solid rgba(255,255,255,0.08)',
                              overflow: 'hidden'
                            }}
                          >
                            {gameSuggestionsLoading ? (
                              <Typography level="body-sm" sx={{ px: 1.5, py: 1.25, color: 'neutral.300' }}>
                                Searching the external game catalog...
                              </Typography>
                            ) : gameSuggestions.length > 0 ? (
                              <Stack spacing={0}>
                                {gameSuggestions.map((result) => (
                                  <Button
                                    key={result.id}
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => handleSelectSuggestion(result)}
                                    sx={{
                                      justifyContent: 'flex-start',
                                      px: 1.25,
                                      py: 1,
                                      borderRadius: 0
                                    }}
                                  >
                                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: '100%' }}>
                                      <Box
                                        sx={{
                                          width: 36,
                                          height: 48,
                                          borderRadius: 'sm',
                                          overflow: 'hidden',
                                          backgroundColor: 'rgba(255,255,255,0.08)',
                                          flexShrink: 0
                                        }}
                                      >
                                        {result.coverUrl ? (
                                          <Box component="img" src={result.coverUrl} alt={result.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : null}
                                      </Box>
                                      <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                                        <Typography level="title-sm">{result.title}</Typography>
                                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                                          {result.platformLabels.join(', ') || 'Platforms unknown'}
                                        </Typography>
                                      </Box>
                                    </Stack>
                                  </Button>
                                ))}
                              </Stack>
                            ) : (
                              <Typography level="body-sm" sx={{ px: 1.5, py: 1.25, color: 'neutral.300' }}>
                                No catalog matches yet. Keep typing to save the title manually.
                              </Typography>
                            )}
                          </Sheet>
                        ) : null}
                        {selectedCatalogResult && !editingLibraryEntry ? (
                          <Sheet variant="soft" sx={{ mt: 1, p: 1.25, borderRadius: 'md' }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <Box
                                sx={{
                                  width: 36,
                                  height: 48,
                                  borderRadius: 'sm',
                                  overflow: 'hidden',
                                  backgroundColor: 'rgba(255,255,255,0.08)',
                                  flexShrink: 0
                                }}
                              >
                                {selectedCatalogResult.coverUrl ? (
                                  <Box component="img" src={selectedCatalogResult.coverUrl} alt={selectedCatalogResult.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : null}
                              </Box>
                              <Box>
                                <Typography level="body-sm" sx={{ color: 'primary.300' }}>
                                  Catalog match selected: {selectedCatalogResult.title}
                                </Typography>
                                {selectedCatalogResult.platformLabels.length ? (
                                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                                    Known platforms: {selectedCatalogResult.platformLabels.join(', ')}.
                                  </Typography>
                                ) : null}
                              </Box>
                            </Stack>
                          </Sheet>
                        ) : null}
                      </Stack>
                      <Stack spacing={1}>
                        <Typography level="title-sm">Platform</Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          Choose every platform where you actually play this game. One library entry can hold multiple platform flags.
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {platformOptions.map((platform) => (
                            <Button
                              key={platform}
                              size="sm"
                              variant={selectedPlatformLabels.includes(platform) ? 'solid' : 'outlined'}
                              color={selectedPlatformLabels.includes(platform) ? 'primary' : 'neutral'}
                              onClick={() => togglePlatformLabel(platform)}
                            >
                              {platform}
                            </Button>
                          ))}
                        </Stack>
                      </Stack>
                      <Stack spacing={1}>
                        <Typography level="title-sm">Interest level</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {(['interested', 'wishlist', 'playing-now'] as const).map((intent) => (
                            <Button
                              key={intent}
                              size="sm"
                              variant={libraryIntent === intent ? 'solid' : 'outlined'}
                              color={libraryIntent === intent ? 'primary' : 'neutral'}
                              onClick={() => setLibraryIntent(intent)}
                            >
                              {formatLibraryIntentLabel(intent)}
                            </Button>
                          ))}
                        </Stack>
                      </Stack>
                      <Stack spacing={1}>
                        <Typography level="title-sm">Game-specific schedule override</Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          Leave this blank to use your profile schedule. Only fill it in when this game usually happens at a different time.
                        </Typography>
                        <Input
                          placeholder={currentUsualAvailability ? `Usually ${currentUsualAvailability}` : 'Example: Friday nights'}
                          value={libraryAvailability}
                          onChange={(event) => setLibraryAvailability(event.target.value)}
                        />
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button color="primary" disabled={librarySaving} onClick={() => void handleAddLibraryEntry()}>
                          {librarySaving ? 'Saving game...' : editingLibraryEntry ? 'Save library changes' : 'Add game to library'}
                        </Button>
                        {editingLibraryEntry ? (
                          <Button variant="outlined" color="neutral" disabled={librarySaving} onClick={handleCancelLibraryEdit}>
                            Cancel
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Card>

                  {hasLibraryEntries ? (
                    <Stack spacing={1.5}>
                      {libraryEntries.map((entry) => (
                        <LibraryEntryRow
                          key={entry.id}
                          entry={entry}
                          isEditing={editingLibraryEntryId === entry.id}
                          editDisabled={librarySaving}
                          isRemoving={removingLibraryEntryId === entry.id}
                          onEdit={handleEditLibraryEntry}
                          onRemove={handleRemoveLibraryEntry}
                        />
                      ))}
                    </Stack>
                  ) : (
                    <EmptyStateCard
                      title="Your library is still empty"
                      body="Add two or three games you care about. That is enough to start populating overlap and make friends useful."
                      chips={['External catalog suggestions', 'Multi-platform flags', 'Discovery updates after save']}
                    />
                  )}
                </Stack>
              ) : (
                <EmptyStateCard
                  title="Sign in to build your library"
                  body="Library management becomes available after Discord sign-in. Once you are signed in, this tab is where you add games, platforms, and schedule defaults."
                  chips={['Discord sign-in', 'Library drives overlap', 'Per-game schedule overrides']}
                />
              )}
            </TabPanel>

            <TabPanel value="play" sx={{ px: 0, pt: 3, backgroundColor: 'transparent' }}>
              <Stack spacing={2}>
                <Typography level="h2">Happening now</Typography>
                <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                  See who in your network is actively looking to play right now, whether they opened up their whole library or just a smaller set of games.
                </Typography>
                {isSignedIn ? (
                  <Card variant="soft" sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography level="title-lg">{activePlayIntent ? 'Your call to play is live' : 'Post a call to play'}</Typography>
                        <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
                          Let your friends know you are ready now. The app only notifies overlapping friends based on the games in your library or the games you pick here.
                        </Typography>
                      </Box>

                      {activePlayIntent ? (
                        <Card color="success" variant="soft" sx={{ p: 2 }}>
                          <Stack spacing={1}>
                            <Typography level="title-md">{activePlayIntent.title}</Typography>
                            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                              <Chip color="success" variant="soft">
                                Live until {new Date(activePlayIntent.windowEndsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </Chip>
                              <Chip color="primary" variant="outlined">
                                {formatNotifyScopeLabel(activePlayIntent.notifyScope)}
                              </Chip>
                              <Chip color="neutral" variant="outlined">
                                {formatPlayIntentSelectionModeLabel(activePlayIntent.selectionMode)}
                              </Chip>
                            </Stack>
                            <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                              {formatNotifyScopeDescription(activePlayIntent.notifyScope)}
                            </Typography>
                            {activePlayIntent.note ? (
                              <Typography level="body-sm" sx={{ color: 'neutral.100' }}>
                                {activePlayIntent.note}
                              </Typography>
                            ) : null}
                          </Stack>
                        </Card>
                      ) : null}

                      {!canPostPlayIntent ? (
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          Add at least one game to your library before posting a call to play.
                        </Typography>
                      ) : null}

                      <Stack spacing={1}>
                        <Typography level="title-sm">Audience</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {(['discovery-and-friends', 'friends-only'] as const).map((scope) => (
                            <Button
                              key={scope}
                              size="sm"
                              variant={playIntentNotifyScope === scope ? 'solid' : 'outlined'}
                              color={playIntentNotifyScope === scope ? 'primary' : 'neutral'}
                              onClick={() => {
                                setPlayIntentNotifyScope(scope)
                                setPlayIntentNotice(null)
                              }}
                            >
                              {formatNotifyScopeLabel(scope)}
                            </Button>
                          ))}
                        </Stack>
                        <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                          {formatNotifyScopeDescription(playIntentNotifyScope)}
                        </Typography>
                      </Stack>

                      <Stack spacing={1}>
                        <Typography level="title-sm">What are you up for?</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {(['library', 'subset'] as const).map((selectionMode) => (
                            <Button
                              key={selectionMode}
                              size="sm"
                              variant={playIntentSelectionMode === selectionMode ? 'solid' : 'outlined'}
                              color={playIntentSelectionMode === selectionMode ? 'primary' : 'neutral'}
                              disabled={!canPostPlayIntent}
                              onClick={() => {
                                setPlayIntentSelectionMode(selectionMode)
                                setPlayIntentNotice(null)
                              }}
                            >
                              {formatPlayIntentSelectionModeLabel(selectionMode)}
                            </Button>
                          ))}
                        </Stack>
                      </Stack>

                      {playIntentSelectionMode === 'subset' ? (
                        <Stack spacing={1}>
                          <Typography level="title-sm">Pick games</Typography>
                          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                            {libraryEntries.map((entry) => (
                              <Button
                                key={entry.id}
                                size="sm"
                                variant={selectedPlayIntentGameIds.includes(entry.gameId) ? 'solid' : 'outlined'}
                                color={selectedPlayIntentGameIds.includes(entry.gameId) ? 'primary' : 'neutral'}
                                disabled={!canPostPlayIntent}
                                onClick={() => togglePlayIntentGame(entry.gameId)}
                              >
                                {entry.title}
                              </Button>
                            ))}
                          </Stack>
                        </Stack>
                      ) : null}

                      <Stack spacing={1}>
                        <Typography level="title-sm">How long should this stay live?</Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {([
                            ['preset', 'Quick picks'],
                            ['custom', 'Custom length'],
                            ['end-time', 'Specific end time']
                          ] as const).map(([timingMode, label]) => (
                            <Button
                              key={timingMode}
                              size="sm"
                              variant={playIntentTimingMode === timingMode ? 'solid' : 'outlined'}
                              color={playIntentTimingMode === timingMode ? 'primary' : 'neutral'}
                              onClick={() => {
                                setPlayIntentTimingMode(timingMode)
                                setPlayIntentNotice(null)
                              }}
                            >
                              {label}
                            </Button>
                          ))}
                        </Stack>

                        {playIntentTimingMode === 'preset' ? (
                          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                            {playIntentPresetDurations.map((durationMinutes) => (
                              <Button
                                key={durationMinutes}
                                size="sm"
                                variant={playIntentDurationMinutes === durationMinutes ? 'solid' : 'outlined'}
                                color={playIntentDurationMinutes === durationMinutes ? 'primary' : 'neutral'}
                                onClick={() => {
                                  setPlayIntentDurationMinutes(durationMinutes)
                                  setPlayIntentCustomDurationInput(String(durationMinutes))
                                  setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(durationMinutes))
                                  setPlayIntentNotice(null)
                                }}
                              >
                                {formatPlayIntentDurationLabel(durationMinutes)}
                              </Button>
                            ))}
                          </Stack>
                        ) : null}

                        {playIntentTimingMode === 'custom' ? (
                          <Input
                            type="number"
                            placeholder="90"
                            value={playIntentCustomDurationInput}
                            onChange={(event) => {
                              setPlayIntentCustomDurationInput(event.target.value)

                              const nextDurationMinutes = parsePlayIntentDurationMinutes(event.target.value)

                              if (nextDurationMinutes != null) {
                                setPlayIntentDurationMinutes(nextDurationMinutes)
                                setPlayIntentEndAtInput(buildPlayIntentEndTimeInputValue(nextDurationMinutes))
                              }

                              setPlayIntentNotice(null)
                            }}
                            endDecorator="minutes"
                            slotProps={{
                              input: {
                                min: minimumPlayIntentDurationMinutes,
                                max: maximumPlayIntentDurationMinutes,
                                step: 15
                              }
                            }}
                          />
                        ) : null}

                        {playIntentTimingMode === 'end-time' ? (
                          <Input
                            type="datetime-local"
                            value={playIntentEndAtInput}
                            onChange={(event) => {
                              setPlayIntentEndAtInput(event.target.value)
                              setPlayIntentNotice(null)
                            }}
                            slotProps={{
                              input: {
                                min: minPlayIntentEndAtInput,
                                max: maxPlayIntentEndAtInput,
                                step: 60
                              }
                            }}
                          />
                        ) : null}

                        <Typography level="body-xs" sx={{ color: playIntentTimingValidationMessage ? 'danger.300' : 'neutral.300' }}>
                          {playIntentTimingValidationMessage
                            ? playIntentTimingValidationMessage
                            : playIntentPreviewEndsAt && resolvedPlayIntentDurationMinutes != null
                              ? `Ends ${playIntentPreviewEndsAt.toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })} (${formatPlayIntentDurationLabel(resolvedPlayIntentDurationMinutes)}).`
                              : 'Choose how long this call to play should stay visible.'}
                        </Typography>
                      </Stack>

                      <Stack spacing={1}>
                        <Typography level="title-sm">Note</Typography>
                        <Input
                          placeholder="Example: voice chat on, happy to fill support"
                          value={playIntentNote}
                          onChange={(event) => {
                            setPlayIntentNote(event.target.value)
                            setPlayIntentNotice(null)
                          }}
                        />
                      </Stack>

                      {playIntentNotice ? (
                        <Card color={playIntentNotice.tone} variant="soft" sx={{ p: 1.5 }}>
                          <Typography level="body-sm">{playIntentNotice.message}</Typography>
                        </Card>
                      ) : null}

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button color="primary" disabled={playIntentSaving || !canPostPlayIntent} onClick={() => void handleSavePlayIntent()}>
                          {playIntentSaving ? 'Saving call to play...' : activePlayIntent ? 'Update call to play' : 'Post call to play'}
                        </Button>
                        {activePlayIntent ? (
                          <Button variant="outlined" color="neutral" disabled={playIntentSaving} onClick={() => void handleClearPlayIntent()}>
                            Clear call to play
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Card>
                ) : null}
                {hasPlayIntentPreviews ? (
                  <Stack spacing={2}>
                    {state.playIntents?.intents.map((intent) => (
                      <PlayIntentCard key={intent.id} intent={intent} />
                    ))}
                  </Stack>
                ) : (
                  <EmptyStateCard
                    title={isSignedIn ? 'No one looking to play right now' : 'Happening now will appear here'}
                    body={
                      isSignedIn
                        ? 'When friends in your network post an active call to play that overlaps with your library, it will show up here.'
                        : 'Once the API responds, this section shows active availability from people in your network.'
                    }
                    chips={
                      isSignedIn
                        ? ['Library overlap required', 'Friends drive visibility', 'Active availability only']
                        : ['Whole library', 'Selected games']
                    }
                  />
                )}
              </Stack>
            </TabPanel>

            <TabPanel value="discovery" sx={{ px: 0, pt: 3, backgroundColor: 'transparent' }}>
              <Stack spacing={2}>
                <Typography level="h2">Games your network also plays</Typography>
                <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                  This is the overlap view now: games first, then the people in your network who have each game in their playlists.
                </Typography>
                {state.error ? (
                  <Card color="danger" variant="soft">
                    <Typography level="body-md">{state.error}</Typography>
                    <Typography level="body-sm" sx={{ mt: 1 }}>
                      Retrying in the background every 5 seconds. The dashboard will refresh automatically when the API responds again.
                    </Typography>
                  </Card>
                ) : null}
                {overlapGames.length > 0 ? (
                  <Stack spacing={2}>
                    {overlapGames.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        canManage={isSignedIn}
                        pendingFriendId={friendPendingId}
                        onToggleFriend={handleToggleFriend}
                      />
                    ))}
                  </Stack>
                ) : (
                  <EmptyStateCard
                    title={isSignedIn ? 'No shared games yet' : 'Shared games will appear here'}
                    body={
                      noDiscoveryServersSelected
                        ? 'Every synced Discord server is currently hidden from discovery, so the app has no mutual-server users to compare against.'
                        : isSignedIn
                          ? 'Add games to your library and keep at least one Discord server enabled for discovery so the app can find overlap with your network.'
                          : 'This section shows games that the seeded demo viewer and other visible users both have in their playlists.'
                    }
                    chips={
                      noDiscoveryServersSelected
                        ? ['Enable a Discord server', 'Mutual users are hidden', 'Discovery is filtered']
                        : isSignedIn
                          ? ['Library drives overlap', 'Discovery servers filter visibility', 'Friends stay visible too']
                          : ['Game-first overlap', 'People per game', 'Demo data seeded']
                    }
                  />
                )}
              </Stack>

              <Stack spacing={2} sx={{ mt: 3 }}>
                <Typography level="h2">Browse by game</Typography>
                <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                  Browse every game that your visible network has added, even when it is not in your own library yet.
                </Typography>
                {hasDiscoveryGames ? (
                  <Stack spacing={2}>
                    {discoveryGames.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        canManage={isSignedIn}
                        pendingFriendId={friendPendingId}
                        onToggleFriend={handleToggleFriend}
                      />
                    ))}
                  </Stack>
                ) : (
                  <EmptyStateCard
                    title={isSignedIn ? 'No network games visible yet' : 'Network games will appear here'}
                    body={
                      noDiscoveryServersSelected
                        ? 'Enable at least one synced Discord server to browse games from mutual-server users again.'
                        : isSignedIn
                          ? 'No visible friends or mutual-server users have games in their playlists yet.'
                          : 'Once the API responds, this section shows every seeded game that visible users have added.'
                    }
                    chips={
                      noDiscoveryServersSelected
                        ? ['Discord server filters', 'Mutual users hidden', 'Turn one back on']
                        : ['Manual discovery', 'Find new friends by game', 'People per title']
                    }
                  />
                )}
              </Stack>

              <Stack spacing={2} sx={{ mt: 3 }}>
                <Typography level="h2">Browse people</Typography>
                <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                  See each visible person and the full playlist they have shared with your current discovery network.
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                  Visibility here is limited to people who also use Game Is Up, either through one of your selected discovery servers or your in-app friends list.
                </Typography>
                {hasDiscoveryPeople ? (
                  <Stack spacing={2}>
                    {discoveryPeople.map((person) => (
                      <PersonCard
                        key={person.id}
                        person={person}
                        canManage={isSignedIn}
                        isPending={friendPendingId === person.id}
                        onToggleFriend={handleToggleFriend}
                      />
                    ))}
                  </Stack>
                ) : (
                  <EmptyStateCard
                    title={isSignedIn ? 'No people visible yet' : 'People will appear here'}
                    body={
                      noDiscoveryServersSelected
                        ? 'All synced Discord servers are hidden, so mutual-server people are excluded from browsing right now.'
                        : isSignedIn
                          ? 'No visible discovery-server users or in-app friends are available yet.'
                          : 'This section shows the seeded people-first view, including visible users from discovery servers and friends.'
                    }
                    chips={
                      noDiscoveryServersSelected
                        ? ['Server filters applied', 'No mutual users visible', 'Friends remain separate']
                        : ['Discovery-server people', 'Friends stay visible', 'Add friends before game overlap']
                    }
                  />
                )}
              </Stack>
            </TabPanel>
          </Tabs>
        </Stack>
      </Box>
    </CssVarsProvider>
  )
}