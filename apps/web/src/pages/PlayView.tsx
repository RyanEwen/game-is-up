import { useState } from 'react'
import { Avatar, Box, Button, Chip, DialogContent, DialogTitle, Card, Stack, Switch, Typography } from '@mui/joy'
import type {
  ActivePlayIntent,
  DiscordServerPreference,
  DiscordVoiceChannel,
  DiscoveryPerson,
  LibraryEntry,
  PlayIntentNotifyScope,
  PlayIntentRecipientResponseChoice,
  PlayIntentPreview,
  PlayIntentSelectionMode
} from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { InterestedPlayerList } from '../components/dashboard/InterestedPlayerList'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { DashboardModalActionBar } from '../components/dashboard/DashboardModalActionBar'
import { PlayIntentCard, PlayIntentGameList } from '../components/dashboard/PlayIntentCard'
import { PlayIntentComposerCard } from '../components/dashboard/PlayIntentComposerCard'
import { CtpDmInboxDialog } from './DebugView'
import { formatNotifyScopeLabel, formatPlayIntentSelectionModeLabel } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget, PlayIntentStartMode, PlayIntentTimingMode } from '../components/dashboard/types'

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
  onOpenDmEmulator,
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
  onOpenDmEmulator?: () => void;
  discoveryPeopleById: ReadonlyMap<string, DiscoveryPerson>;
  isSignedIn: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const startsAt = new Date(activePlayIntent.windowStartsAt)
  const endsAt = new Date(activePlayIntent.windowEndsAt)
  const isScheduledIntent = startsAt.getTime() > Date.now() + 60 * 1000

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
              {isScheduledIntent
                ? `Starts ${startsAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} and ends ${endsAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : `Live until ${endsAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
            </Typography>
          </Box>
          <Button variant="solid" color="primary" onClick={onEdit}>
            Edit call to play
          </Button>
          {onOpenDmEmulator ? (
            <Button variant="outlined" color="neutral" onClick={onOpenDmEmulator}>
              Open DM emulator
            </Button>
          ) : null}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip size="sm" color="primary" variant="soft">
            {formatPlayIntentSelectionModeLabel(activePlayIntent.selectionMode)}
          </Chip>
          <Chip size="sm" color="neutral" variant="outlined">
            {formatNotifyScopeLabel(activePlayIntent.notifyScope)}
          </Chip>
          {activePlayIntent.notifyScope === 'specific-discord-server' && activePlayIntent.targetServer ? (
            <Chip
              size="sm"
              color="neutral"
              variant="outlined"
              startDecorator={<Avatar src={activePlayIntent.targetServer.iconUrl ?? undefined} alt={activePlayIntent.targetServer.name} size="sm" variant="soft" />}
            >
              {activePlayIntent.targetServer.name}
            </Chip>
          ) : null}
          {activePlayIntent.platforms.map((platform: string) => (
            <Chip key={platform} size="sm" color="neutral" variant="outlined">
              {platform}
            </Chip>
          ))}
          {activePlayIntent.joinCount > 0 ? (
            <Chip size="sm" color="success" variant="soft">
              {activePlayIntent.joinCount} {activePlayIntent.joinCount === 1 ? 'person interested' : 'people interested'}
            </Chip>
          ) : null}
        </Stack>

        {activePlayIntent.voiceChannelName ? (
          <Typography level="body-sm" sx={{ color: 'neutral.200' }}>
            Voice channel: {activePlayIntent.voiceChannelName}
          </Typography>
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
  playIntentUnavailableAudienceMessage,
  discordAutoPromptPlayIntent,
  discordAutoPromptPlayIntentSaving,
  activePlayIntent,
  isPlayIntentComposerOpen,
  openPlayIntentComposer,
  closePlayIntentComposer,
  canPostPlayIntent,
  playIntentFilteredAudienceMessage,
  playIntentNotifyScope,
  onPlayIntentNotifyScopeChange,
  playIntentFriendOptions,
  playIntentDiscordServerOptions,
  selectedPlayIntentTargetDiscordServerId,
  onPlayIntentTargetDiscordServerChange,
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
  playIntentVoiceChannelId,
  playIntentVoiceChannelOptions,
  onPlayIntentVoiceChannelSelect,
  playIntentSaving,
  onSavePlayIntent,
  onSavePlayIntentToSelf,
  onClearPlayIntent,
  playIntentPreviews,
  playIntentResponsePendingIntentId,
  onRespondToPlayIntent,
  mutedPlayIntentUserIds,
  onMutePlayIntentUser,
  onUnmutePlayIntentUser,
  discoveryPeople = [],
  friendPendingId = null,
  onToggleFriend = async () => {},
  libraryGameIds,
  addingLibraryGameId,
  onAddGameToLibrary,
  onToggleDiscordAutoPromptPlayIntent
  ,
  debugAdmin,
  onRefreshDebug,
  buildApiUrl,
  parseDebugDmActionResponse
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  playIntentUnavailableAudienceMessage: string | null;
  discordAutoPromptPlayIntent: boolean;
  discordAutoPromptPlayIntentSaving: boolean;
  activePlayIntent: ActivePlayIntent | null;
  isPlayIntentComposerOpen: boolean;
  openPlayIntentComposer: () => void;
  closePlayIntentComposer: () => void;
  canPostPlayIntent: boolean;
  playIntentFilteredAudienceMessage: string | null;
  playIntentNotifyScope: PlayIntentNotifyScope;
  onPlayIntentNotifyScopeChange: (scope: PlayIntentNotifyScope) => void;
  playIntentFriendOptions: Array<Pick<DiscoveryPerson, 'id' | 'handle' | 'displayName' | 'avatarUrl'>>;
  playIntentDiscordServerOptions: DiscordServerPreference[];
  selectedPlayIntentTargetDiscordServerId: string;
  onPlayIntentTargetDiscordServerChange: (serverId: string) => void;
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
  playIntentVoiceChannelId: string;
  playIntentVoiceChannelOptions: DiscordVoiceChannel[];
  onPlayIntentVoiceChannelSelect: (channelId: string | null) => void;
  playIntentSaving: boolean;
  onSavePlayIntent: () => Promise<void>;
  onSavePlayIntentToSelf: () => Promise<void>;
  onClearPlayIntent: () => Promise<void>;
  playIntentPreviews: PlayIntentPreview[];
  playIntentResponsePendingIntentId: string | null;
  onRespondToPlayIntent: (playIntentId: string, responseChoice: PlayIntentRecipientResponseChoice) => Promise<void>;
  mutedPlayIntentUserIds: ReadonlySet<string>;
  onMutePlayIntentUser: (userId: string) => Promise<void>;
  onUnmutePlayIntentUser: (userId: string) => Promise<void>;
  discoveryPeople?: DiscoveryPerson[];
  friendPendingId?: string | null;
  onToggleFriend?: (target: FriendTarget) => Promise<void>;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onToggleDiscordAutoPromptPlayIntent: (nextEnabled: boolean) => Promise<void>;
  debugAdmin: ReturnType<typeof useDashboardContext>['debugViewProps']['debugAdmin'];
  onRefreshDebug: () => Promise<void>;
  buildApiUrl: (path: string) => string;
  parseDebugDmActionResponse: ReturnType<typeof useDashboardContext>['debugViewProps']['parseDebugDmActionResponse'];
}) {
  const [isUnavailableAudienceModalOpen, setIsUnavailableAudienceModalOpen] = useState(false)
  const [selectedMailboxPlayIntentId, setSelectedMailboxPlayIntentId] = useState<string | null>(null)
  const discoveryPeopleById = new Map(discoveryPeople.map((person) => [person.id, person]))
  const selectedMailboxPlayIntent = debugAdmin?.recentPlayIntents.find((intent) => intent.id === selectedMailboxPlayIntentId) ?? null
  const hasScheduledOwnCallToPlay = activePlayIntent ? new Date(activePlayIntent.windowStartsAt).getTime() > Date.now() + 60 * 1000 : false
  const playComposerButtonLabel = activePlayIntent
    ? hasScheduledOwnCallToPlay
      ? 'Manage scheduled call to play'
      : 'Manage live call to play'
    : 'Create call to play'
  const playIntentUnavailableMessage = !activePlayIntent && !canPostPlayIntent
    ? 'You do not have any games in your library yet, so nobody can be matched with your call to play. Add at least one game first.'
    : playIntentUnavailableAudienceMessage
  const playIntentUnavailableTitle = !activePlayIntent && !canPostPlayIntent
    ? 'Add A Game First'
    : 'Nobody Can Receive This Yet'
  const playIntentUnavailableCardTitle = !activePlayIntent && !canPostPlayIntent
    ? 'Your library is still empty'
    : 'Nobody can receive a call to play yet'
  const handleOpenPlayIntent = () => {
    if (!activePlayIntent && !canPostPlayIntent && playIntentUnavailableMessage) {
      setIsUnavailableAudienceModalOpen(true)
      return
    }

    openPlayIntentComposer()
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box>
          <Typography level="h2">Calls to play</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            See who is looking to play, now or later.
          </Typography>
        </Box>
        {isSignedIn ? (
          <Button color="primary" onClick={handleOpenPlayIntent}>
            {playComposerButtonLabel}
          </Button>
        ) : null}
      </Stack>

      {isSignedIn ? (
        <DiscordAutomationCard
          enabled={discordAutoPromptPlayIntent}
          saving={discordAutoPromptPlayIntentSaving}
          onToggle={onToggleDiscordAutoPromptPlayIntent}
        />
      ) : null}

      {isSignedIn && activePlayIntent ? (
        <OwnActivePlayIntentCard
          activePlayIntent={activePlayIntent}
          onEdit={openPlayIntentComposer}
          onOpenDmEmulator={isAdmin && debugAdmin?.recentPlayIntents.some((intent) => intent.id === activePlayIntent.id) ? () => setSelectedMailboxPlayIntentId(activePlayIntent.id) : undefined}
          discoveryPeopleById={discoveryPeopleById}
          isSignedIn={isSignedIn}
          libraryGameIds={libraryGameIds}
          addingLibraryGameId={addingLibraryGameId}
          friendPendingId={friendPendingId}
          onToggleFriend={onToggleFriend}
          onAddGameToLibrary={onAddGameToLibrary}
        />
      ) : null}

      {isSignedIn ? (
        <DashboardModal open={isUnavailableAudienceModalOpen} onClose={() => setIsUnavailableAudienceModalOpen(false)} width="min(96vw, 560px)">
          <DialogTitle sx={{ pr: 6 }}>{playIntentUnavailableTitle}</DialogTitle>
          <DialogContent
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              pr: 0.5,
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <EmptyStateCard
              title={playIntentUnavailableCardTitle}
              body={playIntentUnavailableMessage ?? 'There is nobody available to receive a call to play right now.'}
            />
          </DialogContent>
          <DashboardModalActionBar
            cancelAction={(
              <Button size="lg" variant="outlined" color="neutral" onClick={() => setIsUnavailableAudienceModalOpen(false)} sx={{ minHeight: 52 }}>
                Close
              </Button>
            )}
          />
        </DashboardModal>
      ) : null}

      {isSignedIn ? (
        <DashboardModal open={isPlayIntentComposerOpen} onClose={closePlayIntentComposer} width="min(96vw, 820px)">
            <PlayIntentComposerCard
              activePlayIntent={activePlayIntent}
              isAdmin={isAdmin}
              canPostPlayIntent={canPostPlayIntent}
              playIntentFilteredAudienceMessage={playIntentFilteredAudienceMessage}
              playIntentNotifyScope={playIntentNotifyScope}
              onPlayIntentNotifyScopeChange={onPlayIntentNotifyScopeChange}
              playIntentFriendOptions={playIntentFriendOptions}
              playIntentDiscordServerOptions={playIntentDiscordServerOptions}
              selectedPlayIntentTargetDiscordServerId={selectedPlayIntentTargetDiscordServerId}
              onPlayIntentTargetDiscordServerChange={onPlayIntentTargetDiscordServerChange}
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
      {playIntentPreviews.length > 0 ? (
        <Stack spacing={2}>
          {playIntentPreviews.map((intent) => (
            <PlayIntentCard
              key={intent.id}
              intent={intent}
              canAddToLibrary={isSignedIn}
              discoveryPeopleById={discoveryPeopleById}
              libraryGameIds={libraryGameIds}
              addingLibraryGameId={addingLibraryGameId}
              friendPendingId={friendPendingId}
              onAddToLibrary={onAddGameToLibrary}
              onToggleFriend={onToggleFriend}
              responsePending={playIntentResponsePendingIntentId === intent.id}
              onRespondToIntent={onRespondToPlayIntent}
              isMuted={mutedPlayIntentUserIds.has(intent.user.id)}
              onMuteCreator={onMutePlayIntentUser}
              onUnmuteCreator={onUnmutePlayIntentUser}
              onOpenDmEmulator={isAdmin && debugAdmin?.recentPlayIntents.some((entry) => entry.id === intent.id) ? () => setSelectedMailboxPlayIntentId(intent.id) : undefined}
            />
          ))}
        </Stack>
      ) : (
        <EmptyStateCard
          title={isSignedIn ? activePlayIntent ? 'No other calls to play match your library yet' : 'No calls to play match your library yet' : 'Calls to play will appear here'}
          body={
            isSignedIn
              ? activePlayIntent
                ? 'Your call to play is live above. When someone else in your network posts a matching call to play, it will show up here too.'
                : 'When someone in your network posts a call to play for games that match your library, it will show up here.'
              : 'Once the API responds, this section shows current and scheduled calls to play from people in your friends list or network.'
          }
        />
      )}

      <CtpDmInboxDialog
        open={selectedMailboxPlayIntent != null}
        onClose={() => setSelectedMailboxPlayIntentId(null)}
        ctp={selectedMailboxPlayIntent}
        formatDateTime={(value) => value ? new Date(value).toLocaleString() : 'Not available'}
        buildApiUrl={buildApiUrl}
        onRefreshDebug={onRefreshDebug}
        parseDebugDmActionResponse={parseDebugDmActionResponse}
      />
    </Stack>
  )
}

export function PlayView() {
  const { playViewProps, debugViewProps } = useDashboardContext()

  return <PlayViewContent {...playViewProps} {...debugViewProps} />
}