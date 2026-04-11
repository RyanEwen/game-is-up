import { Box, Button, Card, Input, Link, Sheet, Stack, Typography } from '@mui/joy'
import type { GameSearchResponse, GameSearchResult, LibraryEntry, LibraryEntryIntent } from '@game-is-up/shared'
import { formatLibraryIntentLabel } from './dashboardUtils'
import { DashboardModalActionBar } from './DashboardModalActionBar'

export function LibraryEditorCard({
  editingLibraryEntry,
  libraryTitle,
  onLibraryTitleChange,
  selectedCatalogResult,
  gameSuggestions,
  gameSuggestionsLoading,
  onSelectSuggestion,
  platformOptions,
  selectedPlatformLabels,
  onTogglePlatformLabel,
  libraryIntent,
  onLibraryIntentChange,
  currentUsualAvailability,
  libraryAvailability,
  onLibraryAvailabilityChange,
  librarySaving,
  onAddLibraryEntry,
  onCancelLibraryEdit
}: {
  editingLibraryEntry: LibraryEntry | null;
  libraryTitle: string;
  onLibraryTitleChange: (value: string) => void;
  selectedCatalogResult: GameSearchResult | null;
  gameSuggestions: GameSearchResponse['results'];
  gameSuggestionsLoading: boolean;
  onSelectSuggestion: (result: GameSearchResult) => void;
  platformOptions: string[];
  selectedPlatformLabels: string[];
  onTogglePlatformLabel: (platform: string) => void;
  libraryIntent: LibraryEntryIntent;
  onLibraryIntentChange: (intent: LibraryEntryIntent) => void;
  currentUsualAvailability: string | null;
  libraryAvailability: string;
  onLibraryAvailabilityChange: (value: string) => void;
  librarySaving: boolean;
  onAddLibraryEntry: () => Promise<void>;
  onCancelLibraryEdit: () => void;
}) {
  return (
    <Card
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
              <Button size="sm" variant="outlined" color="neutral" onClick={onCancelLibraryEdit}>
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
            onChange={(event) => onLibraryTitleChange(event.target.value)}
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
                      onClick={() => onSelectSuggestion(result)}
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
                onClick={() => onTogglePlatformLabel(platform)}
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
                onClick={() => onLibraryIntentChange(intent)}
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
            onChange={(event) => onLibraryAvailabilityChange(event.target.value)}
          />
        </Stack>
        <DashboardModalActionBar
          secondaryAction={editingLibraryEntry ? (
            <Button variant="outlined" color="neutral" disabled={librarySaving} onClick={onCancelLibraryEdit} sx={{ minHeight: 46 }}>
              Cancel
            </Button>
          ) : undefined}
          primaryAction={(
            <Button
              size="lg"
              color="success"
              disabled={librarySaving}
              onClick={() => void onAddLibraryEntry()}
              sx={{
                flex: 1,
                minHeight: 52,
                fontWeight: 700,
                boxShadow: '0 12px 30px rgba(46, 125, 50, 0.28)'
              }}
            >
              {librarySaving ? 'Saving game...' : editingLibraryEntry ? 'Save library changes' : 'Add game to library'}
            </Button>
          )}
        />
      </Stack>
    </Card>
  )
}