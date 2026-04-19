import { useState } from 'react'
import { Avatar, Box, Button, Chip, Card, Option, Select, Stack, Switch, Typography } from '@mui/joy'
import { useNavigate } from 'react-router-dom'
import type {
  ActivePlayIntent,
  DiscordServerPreference,
  DiscordVoiceChannel,
  DiscoveryPerson,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentPreview,
  PlayIntentSelectionMode
} from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { InterestedPlayerList } from '../components/dashboard/InterestedPlayerList'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { PlayIntentCard, PlayIntentGameList } from '../components/dashboard/PlayIntentCard'
import { PlayIntentComposerCard } from '../components/dashboard/PlayIntentComposerCard'
import { SectionNav } from '../components/dashboard/SectionNav'
import { sectionScrollMarginTop } from '../components/dashboard/SectionNav.constants'
import { formatNotifyScopeLabel, formatPlayIntentSelectionModeLabel, formatPlayIntentTimingSummary } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type {
  DashboardLibraryQuickAddGame,
  FriendTarget,
  PlayIntentStartMode,
  PlayIntentTimingMode,
  PlayIntentVoiceMode
} from '../components/dashboard/types'

type PlayIntentAudienceFilter = 'applicable' | 'all'

function sortPlayIntentPreviews(intents: PlayIntentPreview[], status: PlayIntentPreview['status']) {
  return [...intents].sort((left, right) => {
    const leftTime = status === 'ended'
      ? new Date(left.availabilityWindow.endsAt).getTime()
      : new Date(left.availabilityWindow.startsAt).getTime()
    const rightTime = status === 'ended'
      ? new Date(right.availabilityWindow.endsAt).getTime()
      : new Date(right.availabilityWindow.startsAt).getTime()

    if (leftTime !== rightTime) {
      return status === 'ended' ? rightTime - leftTime : leftTime - rightTime
    }

    return left.user.displayName.localeCompare(right.user.displayName)
  })
}

function PlayIntentFilterControl({
  value,
  onChange
}: {
  value: PlayIntentAudienceFilter;
  onChange: (value: PlayIntentAudienceFilter) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography level="body-sm" sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}>
        Show
      </Typography>
      <Select
        size="sm"
        value={value}
        onChange={(_event, nextValue) => {
          if (nextValue) {
            onChange(nextValue)
          }
        }}
        sx={{ minWidth: 170 }}
      >
        <Option value="applicable">Only for you</Option>
        <Option value="all">All visible</Option>
      </Select>
    </Box>
  )
}

function DiscordAutomationCard({
  enabled,
  saving,
  onToggle
}: {
  enabled: boolean;
  saving: boolean;
  onToggle: (nextEnabled: boolean) => Promise<void>;
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box>
          <Typography level="title-sm">Automatic call-to-play prompting</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Allow the bot to DM you about creating a call to play when it detects that a game from your library is being played.<br />
            You will only be prompted if you do not already have an active call, and there are matches in your network who can receive it.
          </Typography>
        </Box>
        <Switch
          checked={enabled}
          disabled={saving}
          onChange={(event) => void onToggle(event.target.checked)}
          endDecorator={saving ? 'Saving...' : enabled ? 'On' : 'Off'}
        />
      </Stack>
    </Card>
  )
}

function OwnActivePlayIntentCard({
  activePlayIntent,
  onEdit,
  onOpenDetails,
  discoveryPeopleById,
  isSignedIn,
  libraryGameIds,
  addingLibraryGameId,
  friendPendingId,
  onToggleFriend,
  onAddGameToLibrary,
}: {
  activePlayIntent: ActivePlayIntent;
  onEdit: () => void;
  onOpenDetails: (playIntentId: string) => void;
  discoveryPeopleById: ReadonlyMap<string, DiscoveryPerson>;
  isSignedIn: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const timingSummary = formatPlayIntentTimingSummary(activePlayIntent.windowStartsAt, activePlayIntent.windowEndsAt)

  return (
    <Card
      variant="soft"
      color="primary"
      sx={{
        p: 3,
        border: '1px solid rgba(87, 244, 193, 0.22)',
        background: 'linear-gradient(180deg, rgba(15, 84, 68, 0.34), rgba(11, 16, 32, 0.92))',
        boxShadow: '0 20px 36px -28px rgba(28, 171, 132, 0.5)'
      }}
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
          <Box>
            <Typography level="body-xs" sx={{ color: 'primary.200', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
              Your active call to play
            </Typography>
            <Typography level="title-lg">{activePlayIntent.title}</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.200', mt: 0.5 }}>
              {timingSummary}
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ flexWrap: 'wrap' }}>
            <Button variant="outlined" color="neutral" onClick={() => onOpenDetails(activePlayIntent.id)}>
              Details
            </Button>
            <Button variant="solid" color="primary" onClick={onEdit}>
              Edit call to play
            </Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip size="sm" color="primary" variant="soft">
            {formatPlayIntentSelectionModeLabel(activePlayIntent.selectionMode)}
          </Chip>
          <Chip size="sm" color="neutral" variant="outlined">
            {formatNotifyScopeLabel(activePlayIntent.notifyScope)}
          </Chip>
          {activePlayIntent.notifyScope === 'specific-discord-server'
            ? activePlayIntent.targetServers.map((server) => (
                <Chip
                  key={server.id}
                  size="sm"
                  color="neutral"
                  variant="outlined"
                  startDecorator={<Avatar src={server.iconUrl ?? undefined} alt={server.name} size="sm" variant="soft" />}
                >
                  {server.name}
                </Chip>
              ))
            : null}
          {activePlayIntent.platforms.map((platform: string) => (
            <Chip key={platform} size="sm" color="neutral" variant="outlined">
              {platform}
            </Chip>
          ))}
          {activePlayIntent.interestedCount > 0 ? (
            <Chip size="sm" color="success" variant="soft">
              {activePlayIntent.interestedCount} {activePlayIntent.interestedCount === 1 ? 'person interested' : 'people interested'}
            </Chip>
          ) : null}
        </Stack>

        {!activePlayIntent.discordSpace && activePlayIntent.voiceChannelName ? (
          <Typography level="body-sm" sx={{ color: 'neutral.200' }}>
            Voice channel: {activePlayIntent.voiceChannelName}
          </Typography>
        ) : null}

        {activePlayIntent.discordSpace ? (
          <Stack spacing={0.5}>
            <Typography level="body-sm" sx={{ color: 'neutral.200' }}>
              Temporary Discord channel: {activePlayIntent.discordSpace.status === 'requested' ? 'requested' : activePlayIntent.discordSpace.status.replace('-', ' ')}
            </Typography>
            {activePlayIntent.discordSpace.textChannelName || activePlayIntent.discordSpace.voiceChannelName ? (
              <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                {[
                  activePlayIntent.discordSpace.textChannelName ? `#${activePlayIntent.discordSpace.textChannelName}` : null,
                  activePlayIntent.discordSpace.voiceChannelName ? activePlayIntent.discordSpace.voiceChannelName : null
                ].filter((value): value is string => Boolean(value)).join(' • ')}
              </Typography>
            ) : null}
          </Stack>
        ) : null}

        <InterestedPlayerList
          users={activePlayIntent.interestedUsers}
          sx={{ mt: -0.25 }}
          discoveryPeopleById={discoveryPeopleById}
          canManage={isSignedIn}
          friendPendingId={friendPendingId}
          onToggleFriend={onToggleFriend}
        />

        {activePlayIntent.selectionMode === 'subset' && activePlayIntent.games.length > 0 ? (
          <PlayIntentGameList
            games={activePlayIntent.games}
            canAddToLibrary={isSignedIn}
            libraryGameIds={libraryGameIds}
            addingLibraryGameId={addingLibraryGameId}
            onAddToLibrary={onAddGameToLibrary}
          />
        ) : (
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            This call to play is for any proposed game that matches, not one specific title.
          </Typography>
        )}
      </Stack>
    </Card>
  )
}

function PlayViewContent({
  isSignedIn,
  isAdmin,
  discordAutoPromptPlayIntent,
  discordAutoPromptPlayIntentSaving,
  activePlayIntent,
  isPlayIntentComposerOpen,
  openPlayIntentComposer,
  closePlayIntentComposer,
  playIntentFilteredAudienceMessage,
  playIntentNotifyScope,
  onPlayIntentNotifyScopeChange,
  playIntentFriendOptions,
  playIntentDiscordServerOptions,
  selectedPlayIntentTargetDiscordServerIds,
  onTogglePlayIntentTargetDiscordServer,
  selectedPlayIntentTargetUserIds,
  onTogglePlayIntentTargetUser,
  playIntentSelectionMode,
  onPlayIntentSelectionModeChange,
  libraryEntries,
  selectedPlayIntentGameIds,
  onTogglePlayIntentGame,
  playIntentStartMode,
  onPlayIntentStartModeChange,
  playIntentStartAtInput,
  onPlayIntentStartAtInputChange,
  minPlayIntentStartAtInput,
  playIntentStartHelperText,
  playIntentStartHasError,
  playIntentTimingMode,
  onPlayIntentTimingModeChange,
  playIntentDurationMinutes,
  onPlayIntentPresetSelect,
  playIntentCustomDurationInput,
  onPlayIntentCustomDurationInputChange,
  playIntentEndAtInput,
  onPlayIntentEndAtInputChange,
  minPlayIntentEndAtInput,
  maxPlayIntentEndAtInput,
  playIntentTimingHelperText,
  playIntentTimingHasError,
  playIntentTitle,
  onPlayIntentTitleChange,
  playIntentNote,
  onPlayIntentNoteChange,
  playIntentVoiceMode,
  onPlayIntentVoiceModeChange,
  playIntentVoiceChannelId,
  playIntentVoiceChannelOptions,
  onPlayIntentVoiceChannelSelect,
  playIntentSaving,
  onSavePlayIntent,
  onSavePlayIntentToSelf,
  onClearPlayIntent,
  playIntentPreviews,
  discoveryPeople = [],
  friendPendingId = null,
  onToggleFriend = async () => {},
  libraryGameIds,
  addingLibraryGameId,
  onAddGameToLibrary,
  onToggleDiscordAutoPromptPlayIntent
  ,
  openPlayIntentDetails,
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  discordAutoPromptPlayIntent: boolean;
  discordAutoPromptPlayIntentSaving: boolean;
  activePlayIntent: ActivePlayIntent | null;
  isPlayIntentComposerOpen: boolean;
  openPlayIntentComposer: () => void;
  closePlayIntentComposer: () => void;
  playIntentFilteredAudienceMessage: string | null;
  playIntentNotifyScope: PlayIntentNotifyScope;
  onPlayIntentNotifyScopeChange: (scope: PlayIntentNotifyScope) => void;
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  playIntentDiscordServerOptions: DiscordServerPreference[];
  selectedPlayIntentTargetDiscordServerIds: string[];
  onTogglePlayIntentTargetDiscordServer: (serverId: string) => void;
  selectedPlayIntentTargetUserIds: string[];
  onTogglePlayIntentTargetUser: (userId: string) => void;
  playIntentSelectionMode: PlayIntentSelectionMode;
  onPlayIntentSelectionModeChange: (mode: PlayIntentSelectionMode) => void;
  libraryEntries: LibraryEntry[];
  selectedPlayIntentGameIds: string[];
  onTogglePlayIntentGame: (gameId: string) => void;
  playIntentStartMode: PlayIntentStartMode;
  onPlayIntentStartModeChange: (mode: PlayIntentStartMode) => void;
  playIntentStartAtInput: string;
  onPlayIntentStartAtInputChange: (value: string) => void;
  minPlayIntentStartAtInput: string;
  playIntentStartHelperText: string;
  playIntentStartHasError: boolean;
  playIntentTimingMode: PlayIntentTimingMode;
  onPlayIntentTimingModeChange: (mode: PlayIntentTimingMode) => void;
  playIntentDurationMinutes: number;
  onPlayIntentPresetSelect: (durationMinutes: number) => void;
  playIntentCustomDurationInput: string;
  onPlayIntentCustomDurationInputChange: (value: string) => void;
  playIntentEndAtInput: string;
  onPlayIntentEndAtInputChange: (value: string) => void;
  minPlayIntentEndAtInput: string;
  maxPlayIntentEndAtInput: string;
  playIntentTimingHelperText: string;
  playIntentTimingHasError: boolean;
  playIntentTitle: string;
  onPlayIntentTitleChange: (value: string) => void;
  playIntentNote: string;
  onPlayIntentNoteChange: (value: string) => void;
  playIntentVoiceMode: PlayIntentVoiceMode;
  onPlayIntentVoiceModeChange: (mode: PlayIntentVoiceMode) => void;
  playIntentVoiceChannelId: string;
  playIntentVoiceChannelOptions: DiscordVoiceChannel[];
  onPlayIntentVoiceChannelSelect: (channelId: string | null) => void;
  playIntentSaving: boolean;
  onSavePlayIntent: () => Promise<void>;
  onSavePlayIntentToSelf: () => Promise<void>;
  onClearPlayIntent: () => Promise<void>;
  playIntentPreviews: PlayIntentPreview[];
  discoveryPeople?: DiscoveryPerson[];
  friendPendingId?: string | null;
  onToggleFriend?: (target: FriendTarget) => Promise<void>;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onToggleDiscordAutoPromptPlayIntent: (nextEnabled: boolean) => Promise<void>;
  openPlayIntentDetails: (playIntentId: string) => void;
}) {
  const [activeAudienceFilter, setActiveAudienceFilter] = useState<PlayIntentAudienceFilter>('applicable')
  const [endedAudienceFilter, setEndedAudienceFilter] = useState<PlayIntentAudienceFilter>('applicable')
  const discoveryPeopleById = new Map(discoveryPeople.map((person) => [person.id, person]))
  const hasScheduledOwnCallToPlay = activePlayIntent ? new Date(activePlayIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000 : false
  const playComposerButtonLabel = activePlayIntent
    ? hasScheduledOwnCallToPlay
      ? 'Manage scheduled call to play'
      : 'Manage live call to play'
    : 'Create call to play'
  const activePlayIntentPreviews = sortPlayIntentPreviews(
    playIntentPreviews.filter((intent) => intent.status === 'active'),
    'active'
  )
  const endedPlayIntentPreviews = sortPlayIntentPreviews(
    playIntentPreviews.filter((intent) => intent.status === 'ended'),
    'ended'
  )
  const filteredActivePlayIntentPreviews = activePlayIntentPreviews.filter((intent) => activeAudienceFilter === 'all' || intent.appliesToViewer)
  const filteredEndedPlayIntentPreviews = endedPlayIntentPreviews.filter((intent) => endedAudienceFilter === 'all' || intent.appliesToViewer)
  const playSections = [
    ...(isSignedIn ? [{ id: 'play-settings', label: 'Settings', ariaLabel: 'Play settings' }] : []),
    {
      id: 'active-calls-to-play',
      label: 'Active Calls',
      mobileLabel: 'Active',
      desktopLabel: 'Active Calls',
      ariaLabel: 'Active calls to play',
      count: activePlayIntentPreviews.length
    },
    {
      id: 'ended-calls-to-play',
      label: 'Ended Calls',
      mobileLabel: 'Ended',
      desktopLabel: 'Ended Calls',
      ariaLabel: 'Ended calls to play',
      count: endedPlayIntentPreviews.length
    }
  ]

  return (
    <Stack spacing={3}>
      <SectionNav
        aria-label="Play sections"
        mb={0}
        sections={playSections}
      />

      {isSignedIn ? (
        <Box id="play-settings" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              <Box>
                <Typography level="h3">Settings</Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
                  Control automatic prompting and manage your own call to play.
                </Typography>
              </Box>
              <Button color="primary" onClick={openPlayIntentComposer}>
                {playComposerButtonLabel}
              </Button>
            </Stack>

            <DiscordAutomationCard
              enabled={discordAutoPromptPlayIntent}
              saving={discordAutoPromptPlayIntentSaving}
              onToggle={onToggleDiscordAutoPromptPlayIntent}
            />
          </Stack>
        </Box>
      ) : null}

      {isSignedIn ? (
        <DashboardModal open={isPlayIntentComposerOpen} onClose={closePlayIntentComposer} width="min(96vw, 820px)">
            <PlayIntentComposerCard
              activePlayIntent={activePlayIntent}
              isAdmin={isAdmin}
              playIntentFilteredAudienceMessage={playIntentFilteredAudienceMessage}
              playIntentNotifyScope={playIntentNotifyScope}
              onPlayIntentNotifyScopeChange={onPlayIntentNotifyScopeChange}
              playIntentFriendOptions={playIntentFriendOptions}
              playIntentDiscordServerOptions={playIntentDiscordServerOptions}
              selectedPlayIntentTargetDiscordServerIds={selectedPlayIntentTargetDiscordServerIds}
              onTogglePlayIntentTargetDiscordServer={onTogglePlayIntentTargetDiscordServer}
              selectedPlayIntentTargetUserIds={selectedPlayIntentTargetUserIds}
              onTogglePlayIntentTargetUser={onTogglePlayIntentTargetUser}
              playIntentSelectionMode={playIntentSelectionMode}
              onPlayIntentSelectionModeChange={onPlayIntentSelectionModeChange}
              libraryEntries={libraryEntries}
              selectedPlayIntentGameIds={selectedPlayIntentGameIds}
              onTogglePlayIntentGame={onTogglePlayIntentGame}
              playIntentStartMode={playIntentStartMode}
              onPlayIntentStartModeChange={onPlayIntentStartModeChange}
              playIntentStartAtInput={playIntentStartAtInput}
              onPlayIntentStartAtInputChange={onPlayIntentStartAtInputChange}
              minPlayIntentStartAtInput={minPlayIntentStartAtInput}
              playIntentStartHelperText={playIntentStartHelperText}
              playIntentStartHasError={playIntentStartHasError}
              playIntentTimingMode={playIntentTimingMode}
              onPlayIntentTimingModeChange={onPlayIntentTimingModeChange}
              playIntentDurationMinutes={playIntentDurationMinutes}
              onPlayIntentPresetSelect={onPlayIntentPresetSelect}
              playIntentCustomDurationInput={playIntentCustomDurationInput}
              onPlayIntentCustomDurationInputChange={onPlayIntentCustomDurationInputChange}
              playIntentEndAtInput={playIntentEndAtInput}
              onPlayIntentEndAtInputChange={onPlayIntentEndAtInputChange}
              minPlayIntentEndAtInput={minPlayIntentEndAtInput}
              maxPlayIntentEndAtInput={maxPlayIntentEndAtInput}
              playIntentTimingHelperText={playIntentTimingHelperText}
              playIntentTimingHasError={playIntentTimingHasError}
              playIntentTitle={playIntentTitle}
              onPlayIntentTitleChange={onPlayIntentTitleChange}
              playIntentNote={playIntentNote}
              onPlayIntentNoteChange={onPlayIntentNoteChange}
              playIntentVoiceMode={playIntentVoiceMode}
              onPlayIntentVoiceModeChange={onPlayIntentVoiceModeChange}
              playIntentVoiceChannelId={playIntentVoiceChannelId}
              playIntentVoiceChannelOptions={playIntentVoiceChannelOptions}
              onPlayIntentVoiceChannelSelect={onPlayIntentVoiceChannelSelect}
              playIntentSaving={playIntentSaving}
              onSavePlayIntent={onSavePlayIntent}
              onSavePlayIntentToSelf={onSavePlayIntentToSelf}
              onCancel={closePlayIntentComposer}
              onClearPlayIntent={onClearPlayIntent}
            />
        </DashboardModal>
      ) : null}
      <Box id="active-calls-to-play" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Box>
              <Typography level="h3">Active calls to play</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
                Live now or scheduled soon.
              </Typography>
            </Box>
            {activePlayIntentPreviews.length > 0 ? (
              <PlayIntentFilterControl value={activeAudienceFilter} onChange={setActiveAudienceFilter} />
            ) : null}
          </Stack>

          {isSignedIn && activePlayIntent ? (
            <OwnActivePlayIntentCard
              activePlayIntent={activePlayIntent}
              onEdit={openPlayIntentComposer}
              onOpenDetails={openPlayIntentDetails}
              discoveryPeopleById={discoveryPeopleById}
              isSignedIn={isSignedIn}
              libraryGameIds={libraryGameIds}
              addingLibraryGameId={addingLibraryGameId}
              friendPendingId={friendPendingId}
              onToggleFriend={onToggleFriend}
              onAddGameToLibrary={onAddGameToLibrary}
            />
          ) : null}

          {filteredActivePlayIntentPreviews.length > 0 ? (
            <Stack spacing={2}>
              {filteredActivePlayIntentPreviews.map((intent) => (
                <PlayIntentCard
                  key={intent.id}
                  intent={intent}
                  onOpenDetails={openPlayIntentDetails}
                />
              ))}
            </Stack>
          ) : (
            <EmptyStateCard
              title={
                isSignedIn
                  ? activeAudienceFilter === 'all'
                    ? 'No calls to play in your network right now'
                    : activePlayIntent
                      ? 'No other calls to play match your library yet'
                      : 'No calls to play match your library yet'
                  : 'Calls to play will appear here'
              }
              body={
                isSignedIn
                  ? activeAudienceFilter === 'all'
                    ? 'When someone in your network posts a call to play, it will show up here even when it does not match your library yet.'
                    : activePlayIntent
                      ? 'Your call to play is live above. When someone else in your network posts a matching call to play, it will show up here too.'
                      : 'When someone in your network posts a call to play for games that match your library, it will show up here.'
                  : 'Once the API responds, this section shows current and scheduled calls to play from people in your friends list or network.'
              }
            />
          )}
        </Stack>
      </Box>

      <Stack id="ended-calls-to-play" spacing={2} sx={{ scrollMarginTop: sectionScrollMarginTop }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Box>
            <Typography level="h3">Ended calls to play</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
              Recently ended calls from people in your network.
            </Typography>
          </Box>
          {endedPlayIntentPreviews.length > 0 ? (
            <PlayIntentFilterControl value={endedAudienceFilter} onChange={setEndedAudienceFilter} />
          ) : null}
        </Stack>

        {filteredEndedPlayIntentPreviews.length > 0 ? (
          <Stack spacing={2}>
            {filteredEndedPlayIntentPreviews.map((intent) => (
              <PlayIntentCard
                key={intent.id}
                intent={intent}
                onOpenDetails={openPlayIntentDetails}
              />
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title={
              isSignedIn
                ? endedAudienceFilter === 'all'
                  ? 'No recently ended calls to play'
                  : 'No recently ended matching calls to play'
                : 'Ended calls to play will appear here'
            }
            body={
              isSignedIn
                ? endedAudienceFilter === 'all'
                  ? 'Recently ended calls from people in your network will show up here.'
                  : 'Recently ended calls that matched your library will show up here.'
                : 'Once the API responds, this section shows recently ended calls to play from people in your friends list or network.'
            }
          />
        )}
      </Stack>
    </Stack>
  )
}

export function PlayView() {
  const navigate = useNavigate()
  const { playViewProps, debugViewProps } = useDashboardContext()

  return (
    <PlayViewContent
      {...playViewProps}
      {...debugViewProps}
      openPlayIntentDetails={(playIntentId) => navigate(`/play/${playIntentId}`)}
    />
  )
}