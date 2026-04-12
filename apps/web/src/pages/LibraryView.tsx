import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Box, Button, Card, Checkbox, Chip, DialogContent, DialogTitle, Input, Sheet, Stack, Typography } from '@mui/joy'
import type { GameSearchResponse, GameSearchResult, ImportSteamLibrarySelectionRequest, LibraryEntry, LibraryEntryIntent, LibrarySuggestedGame, SteamLibraryImportGame, SteamLibraryImportPreviewResponse } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { DashboardModalActionBar } from '../components/dashboard/DashboardModalActionBar'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { LibraryEntryCard } from '../components/dashboard/LibraryEntryCard'
import { LibrarySuggestionsRow } from '../components/dashboard/LibrarySuggestionsRow'
import { formatLibraryIntentLabel, libraryEntryGridSx } from '../components/dashboard/dashboardUtils'
import type { DashboardLibraryQuickAddGame } from '../components/dashboard/types'
import { useDashboardContext } from '../contexts/useDashboardContext'

const steamImportPlatformOptions = ['PC', 'Xbox', 'PlayStation', 'Switch', 'Mobile', 'macOS', 'Linux'] as const
const steamImportListMinHeight = 280
const steamImportListMaxHeight = 'min(58vh, 640px)'
const steamImportCollapsedRowEstimate = 108
const steamImportExpandedRowEstimate = 336

type SteamImportSelection = ImportSteamLibrarySelectionRequest['games'][number]

function UsualAvailabilityCard({
  usualAvailability,
  profileSaving,
  usualAvailabilityChanged,
  usualAvailabilityButtonLabel,
  usualAvailabilityHelperText,
  onUsualAvailabilityChange,
  onSaveUsualAvailability
}: {
  usualAvailability: string;
  profileSaving: boolean;
  usualAvailabilityChanged: boolean;
  usualAvailabilityButtonLabel: string;
  usualAvailabilityHelperText: string;
  onUsualAvailabilityChange: (value: string) => void;
  onSaveUsualAvailability: () => Promise<void>;
}) {
  return (
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
          onChange={(event) => onUsualAvailabilityChange(event.target.value)}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Button color="primary" disabled={profileSaving || !usualAvailabilityChanged} onClick={() => void onSaveUsualAvailability()}>
            {usualAvailabilityButtonLabel}
          </Button>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            {usualAvailabilityHelperText}
          </Typography>
        </Stack>
      </Stack>
    </Card>
  )
}

function formatSteamPlaytime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m played`
  }

  const hours = Math.round((minutes / 60) * 10) / 10

  return `${hours}h played`
}

function buildDefaultSteamImportSelection(game: SteamLibraryImportGame): ImportSteamLibrarySelectionRequest['games'][number] {
  return {
    sourceId: game.sourceId,
    platformLabels: game.platformLabels.length > 0 ? [...new Set(game.platformLabels)] : ['PC'],
    intent: 'interested',
    availability: ''
  }
}

function SteamImportConnectContent({
  steamImportEnabled,
  steamLinkPending,
  onStartSteamLink,
}: {
  steamImportEnabled: boolean;
  steamLinkPending: boolean;
  onStartSteamLink: () => Promise<void>;
}) {
  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>Add games from Steam</DialogTitle>
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
        <Stack spacing={1.5}>
          <Typography level="body-md" sx={{ color: 'neutral.300' }}>
            Link Steam, load the games it exposes, then choose only the titles you want to add here.
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Steam is only used for library import. It does not replace Discord sign-in, and private or empty Steam libraries may return no importable games.
          </Typography>
          {!steamImportEnabled ? (
            <Sheet variant="soft" sx={{ p: 1.5, borderRadius: 'md' }}>
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                Steam import is not configured in this environment yet.
              </Typography>
            </Sheet>
          ) : null}
        </Stack>
      </DialogContent>
      <DashboardModalActionBar
        primaryAction={(
          <Button
            size="lg"
            color="primary"
            disabled={!steamImportEnabled || steamLinkPending}
            onClick={() => void onStartSteamLink()}
            sx={{ flex: 1, minHeight: 52, fontWeight: 700 }}
          >
            {steamLinkPending ? 'Opening Steam...' : 'Connect Steam'}
          </Button>
        )}
      />
    </>
  )
}

function SteamImportUnavailableContent({
  preview,
  refreshing,
  disconnectPending,
  onReload,
  onDisconnect
}: {
  preview: SteamLibraryImportPreviewResponse;
  refreshing: boolean;
  disconnectPending: boolean;
  onReload: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>Add games from Steam</DialogTitle>
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
        <Stack spacing={1.5}>
          {preview.account ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip variant="outlined" color="neutral">Connected as {preview.account.displayName}</Chip>
            </Stack>
          ) : null}
          <Typography level="body-md" sx={{ color: 'neutral.300' }}>
            {preview.note ?? 'Steam did not return any importable games right now.'}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Reload from Steam if the library visibility or contents changed, or disconnect this Steam account and try another one.
          </Typography>
        </Stack>
      </DialogContent>
      <DashboardModalActionBar
        secondaryAction={(
          <Button variant="outlined" color="danger" disabled={disconnectPending} onClick={() => void onDisconnect()} sx={{ minHeight: 46 }}>
            {disconnectPending ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        )}
        primaryAction={(
          <Button size="lg" color="primary" disabled={refreshing} onClick={() => void onReload()} sx={{ flex: 1, minHeight: 52, fontWeight: 700 }}>
            {refreshing ? 'Reloading from Steam...' : 'Reload from Steam'}
          </Button>
        )}
      />
    </>
  )
}

function SteamImportLoadingContent() {
  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>Add games from Steam</DialogTitle>
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
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          Loading your Steam library...
        </Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          This reloads the current game list available from the linked Steam account.
        </Typography>
      </DialogContent>
    </>
  )
}

function SteamImportReadyContent({
  preview,
  currentUsualAvailability,
  importing,
  refreshing,
  disconnectPending,
  onClose,
  onReload,
  onDisconnect,
  onImport
}: {
  preview: SteamLibraryImportPreviewResponse;
  currentUsualAvailability: string | null;
  importing: boolean;
  refreshing: boolean;
  disconnectPending: boolean;
  onClose: () => void;
  onReload: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onImport: (games: ImportSteamLibrarySelectionRequest['games']) => Promise<void>;
}) {
  const readyGameCount = preview.games.length
  const alreadyInLibraryCount = preview.games.filter((game) => game.alreadyInLibrary).length
  const [selectedGames, setSelectedGames] = useState<ImportSteamLibrarySelectionRequest['games']>([])

  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>Add games from Steam</DialogTitle>
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
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip color="success" variant="soft">{readyGameCount} Steam games found</Chip>
              <Chip variant="outlined" color="neutral">{alreadyInLibraryCount} already in library</Chip>
              {preview.account ? <Chip variant="outlined" color="neutral">Connected as {preview.account.displayName}</Chip> : null}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button size="sm" variant="outlined" color="neutral" disabled={refreshing || importing} onClick={() => void onReload()}>
                {refreshing ? 'Reloading from Steam...' : 'Reload from Steam'}
              </Button>
              <Button size="sm" variant="outlined" color="danger" disabled={disconnectPending || importing} onClick={() => void onDisconnect()}>
                {disconnectPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </Stack>
          </Stack>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Reload from Steam when the linked account changes. Expand any selected game to edit the same platform, interest, and schedule fields available in manual add.
          </Typography>
        </Stack>

        <SteamImportModalPicker
          preview={preview}
          currentUsualAvailability={currentUsualAvailability}
          importing={importing}
          refreshing={refreshing}
          onReload={onReload}
          onSelectionChange={setSelectedGames}
        />
      </DialogContent>
      <DashboardModalActionBar
        secondaryAction={(
          <Button variant="outlined" color="neutral" disabled={importing} onClick={onClose} sx={{ minHeight: 46 }}>
            Cancel
          </Button>
        )}
        primaryAction={(
          <Button
            size="lg"
            color="success"
            disabled={importing || selectedGames.length === 0}
            onClick={() => void onImport(selectedGames)}
            sx={{
              flex: 1,
              minHeight: 52,
              fontWeight: 700,
              boxShadow: '0 12px 30px rgba(46, 125, 50, 0.28)'
            }}
          >
            {importing
              ? 'Importing Steam games...'
              : selectedGames.length === 1
                ? 'Import 1 Steam game'
                : `Import ${selectedGames.length} Steam games`}
          </Button>
        )}
      />
    </>
  )
}

function SteamImportModalContent({
  preview,
  currentUsualAvailability,
  importing,
  refreshing,
  disconnectPending,
  steamImportEnabled,
  steamConnected,
  steamLinkPending,
  onClose,
  onStartSteamLink,
  onReload,
  onImport,
  onDisconnect
}: {
  preview: SteamLibraryImportPreviewResponse | null;
  currentUsualAvailability: string | null;
  importing: boolean;
  refreshing: boolean;
  disconnectPending: boolean;
  steamImportEnabled: boolean;
  steamConnected: boolean;
  steamLinkPending: boolean;
  onClose: () => void;
  onStartSteamLink: () => Promise<void>;
  onReload: () => Promise<void>;
  onImport: (games: ImportSteamLibrarySelectionRequest['games']) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  if (!steamConnected) {
    return <SteamImportConnectContent steamImportEnabled={steamImportEnabled} steamLinkPending={steamLinkPending} onStartSteamLink={onStartSteamLink} />
  }

  if (refreshing && preview == null) {
    return <SteamImportLoadingContent />
  }

  if (!preview || preview.status === 'unavailable') {
    return (
      <SteamImportUnavailableContent
        preview={preview ?? { status: 'unavailable', note: 'Steam did not return any importable games right now.', account: null, games: [] }}
        refreshing={refreshing}
        disconnectPending={disconnectPending}
        onReload={onReload}
        onDisconnect={onDisconnect}
      />
    )
  }

  return (
    <SteamImportReadyContent
      preview={preview}
      currentUsualAvailability={currentUsualAvailability}
      importing={importing}
      refreshing={refreshing}
      disconnectPending={disconnectPending}
      onClose={onClose}
      onReload={onReload}
      onDisconnect={onDisconnect}
      onImport={onImport}
    />
  )
}

function SteamImportModalPicker({
  preview,
  currentUsualAvailability,
  importing,
  refreshing,
  onReload,
  onSelectionChange
}: {
  preview: SteamLibraryImportPreviewResponse;
  currentUsualAvailability: string | null;
  importing: boolean;
  refreshing: boolean;
  onReload: () => Promise<void>;
  onSelectionChange: (games: ImportSteamLibrarySelectionRequest['games']) => void;
}) {
  const [query, setQuery] = useState('')
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [selectionOptions, setSelectionOptions] = useState<Record<string, SteamImportSelection>>({})
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([])
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const importableGames = preview.games.filter((game) => !game.alreadyInLibrary)

    setQuery('')
    setSelectedSourceIds([])
    setSelectionOptions(
      Object.fromEntries(importableGames.map((game) => [game.sourceId, buildDefaultSteamImportSelection(game)]))
    )
    setExpandedSourceIds([])
  }, [preview])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredGames = preview.games.filter((game) => {
    if (!normalizedQuery) {
      return true
    }

    return game.title.toLowerCase().includes(normalizedQuery)
  })
  const selectedSourceIdSet = new Set(selectedSourceIds)
  const expandedSourceIdSet = new Set(expandedSourceIds)
  const visibleImportableGames = filteredGames.filter((game) => !game.alreadyInLibrary)
  const allVisibleSelected = visibleImportableGames.length > 0 && visibleImportableGames.every((game) => selectedSourceIdSet.has(game.sourceId))
  const selectedGames = selectedSourceIds
    .map((sourceId) => selectionOptions[sourceId])
    .filter((selection): selection is SteamImportSelection => selection != null)

  const rowVirtualizer = useVirtualizer({
    count: filteredGames.length,
    getScrollElement: () => listScrollRef.current,
    getItemKey: (index) => filteredGames[index]?.sourceId ?? index,
    estimateSize: (index) => {
      const game = filteredGames[index]

      if (!game) {
        return steamImportCollapsedRowEstimate
      }

      const isExpanded = selectedSourceIdSet.has(game.sourceId)
        && !game.alreadyInLibrary
        && expandedSourceIdSet.has(game.sourceId)

      return isExpanded ? steamImportExpandedRowEstimate : steamImportCollapsedRowEstimate
    },
    overscan: 8
  })

  useEffect(() => {
    onSelectionChange(selectedGames)
  }, [onSelectionChange, selectedGames])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [expandedSourceIds, selectedSourceIds, rowVirtualizer])

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [normalizedQuery, preview])

  const updateSelectionOptions = (
    sourceId: string,
    updater: (current: SteamImportSelection) => SteamImportSelection
  ) => {
    setSelectionOptions((current) => {
      const existing = current[sourceId]

      if (!existing) {
        return current
      }

      return {
        ...current,
        [sourceId]: updater(existing)
      }
    })
  }

  const toggleSelection = (game: SteamLibraryImportGame) => {
    if (game.alreadyInLibrary) {
      return
    }

    const isSelected = selectedSourceIdSet.has(game.sourceId)

    setSelectedSourceIds((current) => isSelected
      ? current.filter((sourceId) => sourceId !== game.sourceId)
      : [...current, game.sourceId])
    setSelectionOptions((current) => current[game.sourceId]
      ? current
      : {
          ...current,
          [game.sourceId]: buildDefaultSteamImportSelection(game)
        })
    setExpandedSourceIds((current) => isSelected
      ? current.filter((sourceId) => sourceId !== game.sourceId)
      : current.includes(game.sourceId)
        ? current
        : [...current, game.sourceId])
  }

  const toggleVisibleSelection = () => {
    const visibleIds = visibleImportableGames.map((game) => game.sourceId)

    setSelectedSourceIds((current) => {
      const currentSet = new Set(current)

      if (allVisibleSelected) {
        return current.filter((sourceId) => !visibleIds.includes(sourceId))
      }

      for (const sourceId of visibleIds) {
        currentSet.add(sourceId)
      }

      return [...currentSet]
    })

    setSelectionOptions((current) => {
      const next = { ...current }

      for (const game of visibleImportableGames) {
        if (!next[game.sourceId]) {
          next[game.sourceId] = buildDefaultSteamImportSelection(game)
        }
      }

      return next
    })

    if (allVisibleSelected) {
      setExpandedSourceIds((current) => current.filter((sourceId) => !visibleIds.includes(sourceId)))
    }
  }

  const toggleExpanded = (sourceId: string) => {
    setExpandedSourceIds((current) => current.includes(sourceId)
      ? current.filter((entry) => entry !== sourceId)
      : [...current, sourceId])
  }

  return (
    <>
        <Stack spacing={1.5}>
          <Input placeholder="Filter Steam games" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button size="sm" variant="outlined" color="neutral" disabled={visibleImportableGames.length === 0} onClick={toggleVisibleSelection}>
                {allVisibleSelected ? 'Clear visible' : 'Select visible'}
              </Button>
              <Button size="sm" variant="outlined" color="neutral" disabled={refreshing || importing} onClick={() => void onReload()}>
                {refreshing ? 'Reloading from Steam...' : 'Reload from Steam'}
              </Button>
            </Stack>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              {selectedSourceIds.length} selected
            </Typography>
          </Stack>
        </Stack>

        {filteredGames.length > 0 ? (
          <Box
            ref={listScrollRef}
            sx={{
              position: 'relative',
              overflowY: 'auto',
              minHeight: steamImportListMinHeight,
              maxHeight: steamImportListMaxHeight,
              pr: 0.5,
              mr: -0.5,
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <Box sx={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const game = filteredGames[virtualRow.index]

                if (!game) {
                  return null
                }

                const selected = selectedSourceIdSet.has(game.sourceId)
                const options = selectionOptions[game.sourceId] ?? buildDefaultSteamImportSelection(game)
                const showOptions = selected && !game.alreadyInLibrary && expandedSourceIdSet.has(game.sourceId)

                return (
                  <Box
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      pb: 1.25
                    }}
                  >
                    <SteamImportVirtualizedRow
                      game={game}
                      selected={selected}
                      options={options}
                      showOptions={showOptions}
                      currentUsualAvailability={currentUsualAvailability}
                      importing={importing}
                      onToggleSelection={toggleSelection}
                      onToggleExpanded={toggleExpanded}
                      onUpdateSelectionOptions={updateSelectionOptions}
                    />
                  </Box>
                )
              })}
            </Box>
          </Box>
        ) : (
          <Stack spacing={1.25}>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              No Steam games match that filter.
            </Typography>
          </Stack>
        )}
    </>
  )
}

function SteamImportVirtualizedRow({
  game,
  selected,
  options,
  showOptions,
  currentUsualAvailability,
  importing,
  onToggleSelection,
  onToggleExpanded,
  onUpdateSelectionOptions
}: {
  game: SteamLibraryImportGame;
  selected: boolean;
  options: SteamImportSelection;
  showOptions: boolean;
  currentUsualAvailability: string | null;
  importing: boolean;
  onToggleSelection: (game: SteamLibraryImportGame) => void;
  onToggleExpanded: (sourceId: string) => void;
  onUpdateSelectionOptions: (sourceId: string, updater: (current: SteamImportSelection) => SteamImportSelection) => void;
}) {
  const platformOptions = [...new Set([...steamImportPlatformOptions, ...game.platformLabels, ...options.platformLabels])]

  return (
    <Sheet
      variant="soft"
      sx={{
        p: 1.25,
        borderRadius: 'md',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: game.alreadyInLibrary ? 'default' : 'pointer'
      }}
      onClick={() => onToggleSelection(game)}
    >
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Checkbox
          checked={game.alreadyInLibrary || selected}
          disabled={game.alreadyInLibrary || importing}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggleSelection(game)}
        />
        <Box
          sx={{
            width: 56,
            height: 32,
            borderRadius: 'sm',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.08)',
            flexShrink: 0
          }}
        >
          {game.coverUrl ? (
            <Box component="img" src={game.coverUrl} alt={game.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : null}
        </Box>
        <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
            <Typography level="title-sm">{game.title}</Typography>
            {game.alreadyInLibrary ? <Chip size="sm" color="success" variant="soft">Already in library</Chip> : null}
            {selected && !game.alreadyInLibrary ? <Chip size="sm" variant="soft" color="primary">{formatLibraryIntentLabel(options.intent)}</Chip> : null}
          </Stack>
          <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
            {options.platformLabels.join(', ')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip size="sm" variant="outlined" color="neutral">{formatSteamPlaytime(game.minutesPlayedTotal)}</Chip>
            {game.minutesPlayedRecent > 0 ? <Chip size="sm" variant="outlined" color="neutral">{formatSteamPlaytime(game.minutesPlayedRecent)} last 2 weeks</Chip> : null}
            {selected && !game.alreadyInLibrary && options.availability?.trim()
              ? <Chip size="sm" variant="outlined" color="neutral">{options.availability.trim()}</Chip>
              : null}
          </Stack>
        </Stack>
        {selected && !game.alreadyInLibrary ? (
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            onClick={(event) => {
              event.stopPropagation()
              onToggleExpanded(game.sourceId)
            }}
          >
            {showOptions ? 'Hide options' : 'Options'}
          </Button>
        ) : null}
      </Stack>
      {showOptions ? (
        <Stack spacing={1.25} sx={{ mt: 1.25, pl: { xs: 0, sm: 6 } }} onClick={(event) => event.stopPropagation()}>
          <Stack spacing={1}>
            <Typography level="title-sm">Platform</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Choose every platform where you actually play this game.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {platformOptions.map((platform) => {
                const platformSelected = options.platformLabels.includes(platform)

                return (
                  <Button
                    key={platform}
                    size="sm"
                    variant={platformSelected ? 'solid' : 'outlined'}
                    color={platformSelected ? 'primary' : 'neutral'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onUpdateSelectionOptions(game.sourceId, (current) => {
                        if (current.platformLabels.includes(platform)) {
                          if (current.platformLabels.length === 1) {
                            return current
                          }

                          return {
                            ...current,
                            platformLabels: current.platformLabels.filter((entry) => entry !== platform)
                          }
                        }

                        return {
                          ...current,
                          platformLabels: [...current.platformLabels, platform]
                        }
                      })
                    }}
                  >
                    {platform}
                  </Button>
                )
              })}
            </Stack>
          </Stack>
          <Stack spacing={1}>
            <Typography level="title-sm">Interest level</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {(['interested', 'wishlist', 'playing-now'] as const).map((intent) => (
                <Button
                  key={intent}
                  size="sm"
                  variant={options.intent === intent ? 'solid' : 'outlined'}
                  color={options.intent === intent ? 'primary' : 'neutral'}
                  onClick={(event) => {
                    event.stopPropagation()
                    onUpdateSelectionOptions(game.sourceId, (current) => ({
                      ...current,
                      intent
                    }))
                  }}
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
              value={options.availability ?? ''}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                onUpdateSelectionOptions(game.sourceId, (current) => ({
                  ...current,
                  availability: event.target.value
                }))
              }}
            />
          </Stack>
        </Stack>
      ) : null}
    </Sheet>
  )
}

function LibraryViewContent({
  isSignedIn,
  steamImportEnabled,
  steamConnected,
  steamLinkPending,
  steamPreviewLoading,
  steamImporting,
  steamDisconnectPending,
  isSteamImportModalOpen,
  steamImportPreview,
  onStartSteamLink,
  onOpenSteamImport,
  onCloseSteamImport,
  onRefreshSteamImport,
  onImportSteamGames,
  onDisconnectSteam,
  usualAvailability,
  profileSaving,
  usualAvailabilityChanged,
  usualAvailabilityButtonLabel,
  usualAvailabilityHelperText,
  onUsualAvailabilityChange,
  onSaveUsualAvailability,
  isLibraryEditorOpen,
  openLibraryEditor,
  closeLibraryEditor,
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
  onCancelLibraryEdit,
  libraryEntries,
  suggestedGames,
  libraryGameIds,
  addingLibraryGameId,
  editingLibraryEntryId,
  removingLibraryEntryId,
  onEditLibraryEntry,
  onRemoveLibraryEntry,
  onAddGameToLibrary
}: {
  isSignedIn: boolean;
  steamImportEnabled: boolean;
  steamConnected: boolean;
  steamLinkPending: boolean;
  steamPreviewLoading: boolean;
  steamImporting: boolean;
  steamDisconnectPending: boolean;
  isSteamImportModalOpen: boolean;
  steamImportPreview: SteamLibraryImportPreviewResponse | null;
  onStartSteamLink: () => Promise<void>;
  onOpenSteamImport: () => Promise<void>;
  onCloseSteamImport: () => void;
  onRefreshSteamImport: () => Promise<void>;
  onImportSteamGames: (games: ImportSteamLibrarySelectionRequest['games']) => Promise<void>;
  onDisconnectSteam: () => Promise<void>;
  usualAvailability: string;
  profileSaving: boolean;
  usualAvailabilityChanged: boolean;
  usualAvailabilityButtonLabel: string;
  usualAvailabilityHelperText: string;
  onUsualAvailabilityChange: (value: string) => void;
  onSaveUsualAvailability: () => Promise<void>;
  isLibraryEditorOpen: boolean;
  openLibraryEditor: () => void;
  closeLibraryEditor: () => void;
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
  libraryEntries: LibraryEntry[];
  suggestedGames: LibrarySuggestedGame[];
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  editingLibraryEntryId: string | null;
  removingLibraryEntryId: string | null;
  onEditLibraryEntry: (entry: LibraryEntry) => void;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to build your library"
        body="Library management becomes available after Discord sign-in. Once you are signed in, this tab is where you add games manually, connect Steam for selective import, and manage schedule defaults."
        chips={['Discord sign-in', 'Steam import', 'Library drives overlap']}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box>
          <Typography level="h2">Your library</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            Add a few games to your library so discovery, friends, and play-intent matching have something real to work from.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button color="primary" variant="outlined" onClick={() => void onOpenSteamImport()}>
            Add games from Steam
          </Button>
          <Button color="primary" onClick={openLibraryEditor}>
            Add game to library
          </Button>
        </Stack>
      </Stack>

      <UsualAvailabilityCard
        usualAvailability={usualAvailability}
        profileSaving={profileSaving}
        usualAvailabilityChanged={usualAvailabilityChanged}
        usualAvailabilityButtonLabel={usualAvailabilityButtonLabel}
        usualAvailabilityHelperText={usualAvailabilityHelperText}
        onUsualAvailabilityChange={onUsualAvailabilityChange}
        onSaveUsualAvailability={onSaveUsualAvailability}
      />

      <DashboardModal open={isLibraryEditorOpen} onClose={closeLibraryEditor} width="min(96vw, 760px)">
        <LibraryEditorCard
          editingLibraryEntry={editingLibraryEntry}
          libraryTitle={libraryTitle}
          onLibraryTitleChange={onLibraryTitleChange}
          selectedCatalogResult={selectedCatalogResult}
          gameSuggestions={gameSuggestions}
          gameSuggestionsLoading={gameSuggestionsLoading}
          onSelectSuggestion={onSelectSuggestion}
          platformOptions={platformOptions}
          selectedPlatformLabels={selectedPlatformLabels}
          onTogglePlatformLabel={onTogglePlatformLabel}
          libraryIntent={libraryIntent}
          onLibraryIntentChange={onLibraryIntentChange}
          currentUsualAvailability={currentUsualAvailability}
          libraryAvailability={libraryAvailability}
          onLibraryAvailabilityChange={onLibraryAvailabilityChange}
          librarySaving={librarySaving}
          onAddLibraryEntry={onAddLibraryEntry}
          onCancelLibraryEdit={onCancelLibraryEdit}
        />
      </DashboardModal>

      <DashboardModal open={isSteamImportModalOpen} onClose={onCloseSteamImport} width="min(96vw, 860px)">
        <SteamImportModalContent
          preview={steamImportPreview}
          currentUsualAvailability={currentUsualAvailability}
          importing={steamImporting}
          refreshing={steamPreviewLoading}
          disconnectPending={steamDisconnectPending}
          steamImportEnabled={steamImportEnabled}
          steamConnected={steamConnected}
          steamLinkPending={steamLinkPending}
          onClose={onCloseSteamImport}
          onStartSteamLink={onStartSteamLink}
          onReload={onRefreshSteamImport}
          onImport={onImportSteamGames}
          onDisconnect={onDisconnectSteam}
        />
      </DashboardModal>

      <LibrarySuggestionsRow
        suggestedGames={suggestedGames}
        libraryGameIds={libraryGameIds}
        addingLibraryGameId={addingLibraryGameId}
        onAddToLibrary={onAddGameToLibrary}
      />

      {libraryEntries.length > 0 ? (
        <Box sx={libraryEntryGridSx}>
          {libraryEntries.map((entry) => (
            <LibraryEntryCard
              key={entry.id}
              entry={entry}
              isEditing={editingLibraryEntryId === entry.id}
              editDisabled={librarySaving}
              isRemoving={removingLibraryEntryId === entry.id}
              onEdit={onEditLibraryEntry}
              onRemove={onRemoveLibraryEntry}
            />
          ))}
        </Box>
      ) : (
        <EmptyStateCard
          title="Your library is still empty"
          body="Add two or three games you care about, or pull in a hand-picked batch from Steam. That is enough to start populating overlap and make friends useful."
          chips={['Steam import', 'Multi-platform flags', 'Discovery updates after save']}
        />
      )}
    </Stack>
  )
}

export function LibraryView() {
  const { libraryViewProps } = useDashboardContext()

  return <LibraryViewContent {...libraryViewProps} />
}