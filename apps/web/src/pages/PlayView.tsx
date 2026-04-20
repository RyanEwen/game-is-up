import { useState } from 'react'
import { Box, Button, Card, Option, Select, Stack, Switch, Typography } from '@mui/joy'
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
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { PlayIntentCard } from '../components/dashboard/PlayIntentCard'
import { PlayIntentComposerCard } from '../components/dashboard/PlayIntentComposerCard'
import { SectionNav } from '../components/dashboard/SectionNav'
import { sectionScrollMarginTop } from '../components/dashboard/SectionNav.constants'
import {
  buildHeaderFilterSelectSx,
  headerActionFilterButtonSx,
  headerActionFilterStackSx,
  headerFilterControlMatchActionWidthSx,
  headerFilterControlSx
} from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type {
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
  onChange,
  matchActionWidth = false
}: {
  value: PlayIntentAudienceFilter;
  onChange: (value: PlayIntentAudienceFilter) => void;
  matchActionWidth?: boolean;
}) {
  return (
    <Box sx={matchActionWidth ? headerFilterControlMatchActionWidthSx : headerFilterControlSx}>
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
        sx={buildHeaderFilterSelectSx(170)}
      >
        <Option value="applicable">Only for you</Option>
        <Option value="all">All</Option>
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
            You will only be prompted if you do not already have an overlapping call, and there are matches in your network who can receive it.
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

function PlayViewContent({
  isSignedIn,
  discordAutoPromptPlayIntent,
  discordAutoPromptPlayIntentSaving,
  activePlayIntent,
  composerPlayIntent,
  isPlayIntentComposerOpen,
  openPlayIntentComposer,
  closePlayIntentComposer,
  playIntentFilteredAudienceMessage,
  playIntentTargetedAudienceWarningMessage,
  playIntentUnmatchedTargetUsers,
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
  onClearPlayIntent,
  playIntentPreviews,
  onToggleDiscordAutoPromptPlayIntent
  ,
  openPlayIntentDetails,
}: {
  isSignedIn: boolean;
  discordAutoPromptPlayIntent: boolean;
  discordAutoPromptPlayIntentSaving: boolean;
  activePlayIntent: ActivePlayIntent | null;
  composerPlayIntent: ActivePlayIntent | null;
  isPlayIntentComposerOpen: boolean;
  openPlayIntentComposer: () => void;
  closePlayIntentComposer: () => void;
  playIntentFilteredAudienceMessage: string | null;
  playIntentTargetedAudienceWarningMessage: string | null;
  playIntentUnmatchedTargetUsers: Array<Pick<DiscoveryPerson, 'id' | 'displayName' | 'avatarUrl'>>;
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
  onClearPlayIntent: () => Promise<void>;
  playIntentPreviews: PlayIntentPreview[];
  onToggleDiscordAutoPromptPlayIntent: (nextEnabled: boolean) => Promise<void>;
  openPlayIntentDetails: (playIntentId: string) => void;
}) {
  const [activeAudienceFilter, setActiveAudienceFilter] = useState<PlayIntentAudienceFilter>('applicable')
  const [endedAudienceFilter, setEndedAudienceFilter] = useState<PlayIntentAudienceFilter>('applicable')

  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to plan calls to play"
        body="Play becomes personalized after Discord sign-in. Once you are signed in, you can create your own calls to play, see which visible calls apply to you by default, and respond to other players."
      />
    )
  }

  const playComposerButtonLabel = activePlayIntent
    ? 'Create another call to play'
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
  const activeHeaderControls = isSignedIn ? (
    <Stack spacing={1} alignItems="stretch" sx={headerActionFilterStackSx}>
      <Button color="primary" onClick={openPlayIntentComposer} sx={headerActionFilterButtonSx}>
        {playComposerButtonLabel}
      </Button>
      <PlayIntentFilterControl value={activeAudienceFilter} onChange={setActiveAudienceFilter} matchActionWidth />
    </Stack>
  ) : (
    <PlayIntentFilterControl value={activeAudienceFilter} onChange={setActiveAudienceFilter} />
  )
  const playSections = [
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
    },
    ...(isSignedIn ? [{ id: 'play-settings', label: 'Settings', ariaLabel: 'Play settings' }] : [])
  ]

  return (
    <Stack spacing={3}>
      <SectionNav
        aria-label="Play sections"
        mb={0}
        sections={playSections}
      />

      {isSignedIn ? (
        <DashboardModal open={isPlayIntentComposerOpen} onClose={closePlayIntentComposer} width="min(96vw, 820px)">
            <PlayIntentComposerCard
              isOpen={isPlayIntentComposerOpen}
              composerPlayIntent={composerPlayIntent}
              playIntentFilteredAudienceMessage={playIntentFilteredAudienceMessage}
              playIntentTargetedAudienceWarningMessage={playIntentTargetedAudienceWarningMessage}
              playIntentUnmatchedTargetUsers={playIntentUnmatchedTargetUsers}
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
            {activeHeaderControls}
          </Stack>

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
                      ? 'When someone else in your network posts a matching call to play, it will show up here too.'
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
          <PlayIntentFilterControl value={endedAudienceFilter} onChange={setEndedAudienceFilter} />
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

      {isSignedIn ? (
        <Box id="play-settings" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Box>
                <Typography level="h3">Settings</Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
                  Control automatic prompting and manage your calls to play.
                </Typography>
              </Box>
            </Stack>

            <DiscordAutomationCard
              enabled={discordAutoPromptPlayIntent}
              saving={discordAutoPromptPlayIntentSaving}
              onToggle={onToggleDiscordAutoPromptPlayIntent}
            />
          </Stack>
        </Box>
      ) : null}
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