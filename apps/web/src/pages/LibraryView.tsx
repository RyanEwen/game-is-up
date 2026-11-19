import { useEffect, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { apiRequest } from '../lib/apiQuery'
import { queryKeys } from '../lib/queryKeys'
import {
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  DialogContent,
  DialogTitle,
  Input,
  Option,
  Select,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import type {
  GameDetails,
  GameSearchResponse,
  GameSearchResult,
  ImportSteamLibrarySelectionRequest,
  LibraryEntry,
  LibraryEntryIntent,
  LibrarySuggestedGame,
  SteamLibraryImportGame,
  SteamLibraryImportPreviewResponse,
  UserGameAlias,
  UserPlatformAlias,
} from '@game-is-up/shared'
import { gameDetailsResponseSchema } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { AliasManagementCard } from '../components/dashboard/AliasManagementCard'
import { DashboardApiIssueCard } from '../components/dashboard/DashboardApiIssueCard'
import { DashboardModalActionBar } from '../components/dashboard/DashboardModalActionBar'
import { DashboardDeferredImage } from '../components/dashboard/DashboardDeferredImage'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import { EmptyState } from '../components/EmptyState'
import { SignedOutEmptyState } from '../components/dashboard/SignedOutEmptyState'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { LibraryEntryCard } from '../components/dashboard/LibraryEntryCard'
import { LibrarySuggestionsRow } from '../components/dashboard/LibrarySuggestionsRow'
import { SectionNav } from '../components/dashboard/SectionNav'
import { sectionScrollMarginTop } from '../components/dashboard/SectionNav.constants'
import {
  formatLibraryIntentLabel,
  libraryEntryGridSx,
} from '../components/dashboard/dashboardUtils'
import type { DashboardLibraryQuickAddGame } from '../components/dashboard/types'
import { useDashboardContext } from '../contexts/useDashboardContext'
import { useResetOnChange } from '../hooks/useResetOnChange'

const steamImportPlatformOptions = [
  'PC',
  'Xbox',
  'PlayStation',
  'Switch',
  'Mobile',
  'macOS',
  'Linux',
] as const
const steamImportListMinHeight = 280
const steamImportListMaxHeight = 'min(58vh, 640px)'
const steamImportPageSize = 50

type SteamImportSelection = ImportSteamLibrarySelectionRequest['games'][number]
type SteamImportLibraryFilter = 'importable' | 'already-in-library' | 'all'
type SteamImportPlaytimeFilter =
  'all' | 'recently-played' | 'played' | 'unplayed'
type SteamImportSortOption =
  'recommended' | 'most-played' | 'least-played' | 'recently-played'

function UsualAvailabilityCard({
  usualAvailability,
  profileSaving,
  usualAvailabilityChanged,
  usualAvailabilityButtonLabel,
  usualAvailabilityHelperText,
  onUsualAvailabilityChange,
  onSaveUsualAvailability,
}: {
  usualAvailability: string
  profileSaving: boolean
  usualAvailabilityChanged: boolean
  usualAvailabilityButtonLabel: string
  usualAvailabilityHelperText: string
  onUsualAvailabilityChange: (value: string) => void
  onSaveUsualAvailability: () => Promise<void>
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Input
          placeholder="Example: Weeknights after 8pm"
          value={usualAvailability}
          onChange={(event) => onUsualAvailabilityChange(event.target.value)}
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Button
            color="primary"
            disabled={profileSaving || !usualAvailabilityChanged}
            onClick={() => void onSaveUsualAvailability()}
          >
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

function compareSteamImportTitles(
  left: SteamLibraryImportGame,
  right: SteamLibraryImportGame,
): number {
  return left.title.localeCompare(right.title, undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

/**
 * Orders the filtered Steam preview list before pagination.
 *
 * `recommended` intentionally returns the list untouched: the API already sorts it
 * (already-in-library last, then title) and the picker refines that ordering one page
 * at a time, once lazily loaded metadata reveals which titles are single-player only.
 * The playtime sorts must run globally instead, because playtime ships with every
 * preview game and a per-page sort would only shuffle rows within an arbitrary slice.
 */
function sortSteamImportGames(
  games: SteamLibraryImportGame[],
  sortOption: SteamImportSortOption,
): SteamLibraryImportGame[] {
  if (sortOption === 'recommended') {
    return games
  }

  return [...games].sort((left, right) => {
    if (
      sortOption === 'recently-played' &&
      left.minutesPlayedRecent !== right.minutesPlayedRecent
    ) {
      return right.minutesPlayedRecent - left.minutesPlayedRecent
    }

    if (left.minutesPlayedTotal !== right.minutesPlayedTotal) {
      return sortOption === 'least-played'
        ? left.minutesPlayedTotal - right.minutesPlayedTotal
        : right.minutesPlayedTotal - left.minutesPlayedTotal
    }

    return compareSteamImportTitles(left, right)
  })
}

function buildDefaultSteamImportSelection(
  game: SteamLibraryImportGame,
): ImportSteamLibrarySelectionRequest['games'][number] {
  return {
    sourceId: game.sourceId,
    platformLabels:
      game.platformLabels.length > 0
        ? [...new Set(game.platformLabels)]
        : ['PC'],
    intent: 'interested',
    availability: '',
  }
}

function SteamImportConnectContent({
  steamImportEnabled,
  steamLinkPending,
  onClose,
  onStartSteamLink,
}: {
  steamImportEnabled: boolean
  steamLinkPending: boolean
  onClose: () => void
  onStartSteamLink: () => Promise<void>
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
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Stack spacing={1.5}>
          <Typography level="body-md" sx={{ color: 'neutral.300' }}>
            Link Steam, load the games it exposes, then choose only the titles
            you want to add here.
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Steam is only used for library import. It does not replace Discord
            sign-in, and private or empty Steam libraries may return no
            importable games.
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
        cancelAction={
          <Button
            size="lg"
            variant="outlined"
            color="neutral"
            disabled={steamLinkPending}
            onClick={onClose}
            sx={{ minHeight: 52 }}
          >
            Cancel
          </Button>
        }
        primaryAction={
          <Button
            size="lg"
            color="primary"
            disabled={!steamImportEnabled || steamLinkPending}
            onClick={() => void onStartSteamLink()}
            sx={{ flex: 1, minHeight: 52, fontWeight: 700 }}
          >
            {steamLinkPending ? 'Opening Steam...' : 'Connect Steam'}
          </Button>
        }
      />
    </>
  )
}

function SteamImportUnavailableContent({
  preview,
  refreshing,
  disconnectPending,
  onClose,
  onReload,
  onDisconnect,
}: {
  preview: SteamLibraryImportPreviewResponse
  refreshing: boolean
  disconnectPending: boolean
  onClose: () => void
  onReload: () => Promise<void>
  onDisconnect: () => Promise<void>
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
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Stack spacing={1.5}>
          {preview.account ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip variant="outlined" color="neutral">
                Connected as {preview.account.displayName}
              </Chip>
            </Stack>
          ) : null}
          <Typography level="body-md" sx={{ color: 'neutral.300' }}>
            {preview.note ??
              'Steam did not return any importable games right now.'}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Reload from Steam if the library visibility or contents changed, or
            disconnect this Steam account and try another one.
          </Typography>
        </Stack>
      </DialogContent>
      <DashboardModalActionBar
        secondaryAction={
          <Button
            variant="outlined"
            color="danger"
            disabled={disconnectPending}
            onClick={() => void onDisconnect()}
            sx={{ minHeight: 46 }}
          >
            {disconnectPending ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        }
        cancelAction={
          <Button
            size="lg"
            variant="outlined"
            color="neutral"
            disabled={refreshing || disconnectPending}
            onClick={onClose}
            sx={{ minHeight: 52 }}
          >
            Cancel
          </Button>
        }
        primaryAction={
          <Button
            size="lg"
            color="primary"
            disabled={refreshing}
            onClick={() => void onReload()}
            sx={{ flex: 1, minHeight: 52, fontWeight: 700 }}
          >
            {refreshing ? 'Reloading from Steam...' : 'Reload from Steam'}
          </Button>
        }
      />
    </>
  )
}

function SteamImportLoadingContent({ onClose }: { onClose: () => void }) {
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
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          Loading your Steam library...
        </Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          This reloads the current game list available from the linked Steam
          account.
        </Typography>
      </DialogContent>
      <DashboardModalActionBar
        cancelAction={
          <Button
            size="lg"
            variant="outlined"
            color="neutral"
            onClick={onClose}
            sx={{ minHeight: 52 }}
          >
            Cancel
          </Button>
        }
      />
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
  onImport,
}: {
  preview: SteamLibraryImportPreviewResponse
  currentUsualAvailability: string | null
  importing: boolean
  refreshing: boolean
  disconnectPending: boolean
  onClose: () => void
  onReload: () => Promise<void>
  onDisconnect: () => Promise<void>
  onImport: (
    games: ImportSteamLibrarySelectionRequest['games'],
  ) => Promise<void>
}) {
  const readyGameCount = preview.games.length
  const alreadyInLibraryCount = preview.games.filter(
    (game) => game.alreadyInLibrary,
  ).length
  const [selectedGames, setSelectedGames] = useState<
    ImportSteamLibrarySelectionRequest['games']
  >([])

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
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip color="success" variant="soft">
                {readyGameCount} Steam games found
              </Chip>
              <Chip variant="outlined" color="neutral">
                {alreadyInLibraryCount} already in library
              </Chip>
              {preview.account ? (
                <Chip variant="outlined" color="neutral">
                  Connected as {preview.account.displayName}
                </Chip>
              ) : null}
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                disabled={refreshing || importing}
                onClick={() => void onReload()}
                sx={{ flex: 1 }}
              >
                {refreshing ? 'Reloading from Steam...' : 'Reload from Steam'}
              </Button>
              <Button
                size="sm"
                variant="outlined"
                color="danger"
                disabled={disconnectPending || importing}
                onClick={() => void onDisconnect()}
                sx={{ flex: 1 }}
              >
                {disconnectPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </Stack>
          </Stack>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Reload from Steam when the linked account changes. Expand any
            selected game to edit the same platform, interest, and schedule
            fields available in manual add.
          </Typography>
        </Stack>

        <SteamImportModalPicker
          preview={preview}
          currentUsualAvailability={currentUsualAvailability}
          importing={importing}
          onSelectionChange={setSelectedGames}
        />
      </DialogContent>
      <DashboardModalActionBar
        cancelAction={
          <Button
            size="lg"
            variant="outlined"
            color="neutral"
            disabled={importing}
            onClick={onClose}
            sx={{ minHeight: 52 }}
          >
            Cancel
          </Button>
        }
        primaryAction={
          <Button
            size="lg"
            color="success"
            disabled={importing || selectedGames.length === 0}
            onClick={() => void onImport(selectedGames)}
            sx={{
              flex: 1,
              minHeight: 52,
              fontWeight: 700,
              boxShadow: 'none',
            }}
          >
            {importing
              ? 'Importing Steam games...'
              : selectedGames.length === 1
                ? 'Import 1 Steam game'
                : `Import ${selectedGames.length} Steam games`}
          </Button>
        }
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
  onDisconnect,
}: {
  preview: SteamLibraryImportPreviewResponse | null
  currentUsualAvailability: string | null
  importing: boolean
  refreshing: boolean
  disconnectPending: boolean
  steamImportEnabled: boolean
  steamConnected: boolean
  steamLinkPending: boolean
  onClose: () => void
  onStartSteamLink: () => Promise<void>
  onReload: () => Promise<void>
  onImport: (
    games: ImportSteamLibrarySelectionRequest['games'],
  ) => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  if (!steamConnected) {
    return (
      <SteamImportConnectContent
        steamImportEnabled={steamImportEnabled}
        steamLinkPending={steamLinkPending}
        onClose={onClose}
        onStartSteamLink={onStartSteamLink}
      />
    )
  }

  if (refreshing && preview == null) {
    return <SteamImportLoadingContent onClose={onClose} />
  }

  if (!preview || preview.status === 'unavailable') {
    return (
      <SteamImportUnavailableContent
        preview={
          preview ?? {
            status: 'unavailable',
            note: 'Steam did not return any importable games right now.',
            account: null,
            games: [],
          }
        }
        refreshing={refreshing}
        disconnectPending={disconnectPending}
        onClose={onClose}
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

/** The default import choice for every game in the preview that is not already in the library. */
function buildDefaultSelectionOptions(
  preview: SteamLibraryImportPreviewResponse,
): Record<string, SteamImportSelection> {
  return Object.fromEntries(
    preview.games
      .filter((game) => !game.alreadyInLibrary)
      .map((game) => [game.sourceId, buildDefaultSteamImportSelection(game)]),
  )
}

function SteamImportModalPicker({
  preview,
  currentUsualAvailability,
  importing,
  onSelectionChange,
}: {
  preview: SteamLibraryImportPreviewResponse
  currentUsualAvailability: string | null
  importing: boolean
  onSelectionChange: (
    games: ImportSteamLibrarySelectionRequest['games'],
  ) => void
}) {
  const [query, setQuery] = useState('')
  const [libraryFilter, setLibraryFilter] =
    useState<SteamImportLibraryFilter>('importable')
  const [playtimeFilter, setPlaytimeFilter] =
    useState<SteamImportPlaytimeFilter>('all')
  const [sortOption, setSortOption] =
    useState<SteamImportSortOption>('recommended')
  const [page, setPage] = useState(1)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [selectionOptions, setSelectionOptions] = useState<
    Record<string, SteamImportSelection>
  >(() => buildDefaultSelectionOptions(preview))
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([])
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  // A new preview (a fresh fetch from Steam) starts the import table over.
  useResetOnChange([preview], () => {
    setQuery('')
    setLibraryFilter('importable')
    setPlaytimeFilter('all')
    setSortOption('recommended')
    setPage(1)
    setSelectedSourceIds([])
    setSelectionOptions(buildDefaultSelectionOptions(preview))
    setExpandedSourceIds([])
  })

  const normalizedQuery = query.trim().toLowerCase()
  const filteredGames = preview.games.filter((game) => {
    const matchesQuery =
      !normalizedQuery || game.title.toLowerCase().includes(normalizedQuery)
    const matchesLibraryFilter =
      libraryFilter === 'all'
        ? true
        : libraryFilter === 'importable'
          ? !game.alreadyInLibrary
          : game.alreadyInLibrary
    const matchesPlaytimeFilter =
      playtimeFilter === 'all'
        ? true
        : playtimeFilter === 'recently-played'
          ? game.minutesPlayedRecent > 0
          : playtimeFilter === 'played'
            ? game.minutesPlayedTotal > 0
            : game.minutesPlayedTotal === 0

    return matchesQuery && matchesLibraryFilter && matchesPlaytimeFilter
  })
  const sortedGames = sortSteamImportGames(filteredGames, sortOption)
  const totalPages = Math.max(
    1,
    Math.ceil(sortedGames.length / steamImportPageSize),
  )
  const currentPage = Math.min(page, totalPages)
  const pageStartIndex = (currentPage - 1) * steamImportPageSize
  const pageCandidateGames = sortedGames.slice(
    pageStartIndex,
    pageStartIndex + steamImportPageSize,
  )
  // Steam metadata for the games on this page, shared with the game details dialog's cache. A
  // game whose metadata fails reads as unknown (null), as before.
  const steamDetailQueries = useQueries({
    queries: pageCandidateGames.map((game) => ({
      queryKey: queryKeys.gameDetails('steam', game.sourceId),
      queryFn: () =>
        apiRequest(
          `/api/library/catalog/steam/${encodeURIComponent(game.sourceId)}/details`,
          gameDetailsResponseSchema,
          'Unable to load Steam metadata right now.',
        ),
    })),
  })
  const steamDetailsBySourceId: Record<string, GameDetails | null> = {}
  pageCandidateGames.forEach((game, index) => {
    const query = steamDetailQueries[index]
    if (query?.data) {
      steamDetailsBySourceId[game.sourceId] = query.data.game
    } else if (query?.error) {
      steamDetailsBySourceId[game.sourceId] = null
    }
  })
  const pageGames =
    sortOption === 'recommended'
      ? [...pageCandidateGames].sort((left, right) => {
          const leftClassification =
            steamDetailsBySourceId[left.sourceId]?.gameplay.classification ??
            left.gameplayClassification
          const rightClassification =
            steamDetailsBySourceId[right.sourceId]?.gameplay.classification ??
            right.gameplayClassification
          const leftPenalty = leftClassification === 'singleplayer-only' ? 1 : 0
          const rightPenalty =
            rightClassification === 'singleplayer-only' ? 1 : 0

          if (leftPenalty !== rightPenalty) {
            return leftPenalty - rightPenalty
          }

          return compareSteamImportTitles(left, right)
        })
      : pageCandidateGames
  const steamPageMetadataLoading = steamDetailQueries.some(
    (query) => query.isFetching,
  )
  const selectedSourceIdSet = new Set(selectedSourceIds)
  const expandedSourceIdSet = new Set(expandedSourceIds)

  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage)
    }
  }, [currentPage, page])

  useEffect(() => {
    const selectedGames = selectedSourceIds
      .map((sourceId) => selectionOptions[sourceId])
      .filter(
        (selection): selection is SteamImportSelection => selection != null,
      )

    onSelectionChange(selectedGames)
  }, [onSelectionChange, selectedSourceIds, selectionOptions])

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [
    currentPage,
    libraryFilter,
    normalizedQuery,
    playtimeFilter,
    preview,
    sortOption,
  ])

  const updateSelectionOptions = (
    sourceId: string,
    updater: (current: SteamImportSelection) => SteamImportSelection,
  ) => {
    setSelectionOptions((current) => {
      const existing = current[sourceId]

      if (!existing) {
        return current
      }

      return {
        ...current,
        [sourceId]: updater(existing),
      }
    })
  }

  const toggleSelection = (game: SteamLibraryImportGame) => {
    if (game.alreadyInLibrary) {
      return
    }

    const isSelected = selectedSourceIdSet.has(game.sourceId)

    setSelectedSourceIds((current) =>
      isSelected
        ? current.filter((sourceId) => sourceId !== game.sourceId)
        : [...current, game.sourceId],
    )
    setSelectionOptions((current) =>
      current[game.sourceId]
        ? current
        : {
            ...current,
            [game.sourceId]: buildDefaultSteamImportSelection(game),
          },
    )
    setExpandedSourceIds((current) =>
      isSelected
        ? current.filter((sourceId) => sourceId !== game.sourceId)
        : current.includes(game.sourceId)
          ? current
          : [...current, game.sourceId],
    )
  }

  const toggleExpanded = (sourceId: string) => {
    setExpandedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((entry) => entry !== sourceId)
        : [...current, sourceId],
    )
  }

  return (
    <>
      <Stack spacing={1.5}>
        <Stack spacing={1}>
          <Input
            placeholder="Filter Steam games"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            sx={{ width: '100%' }}
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Select
              size="sm"
              value={libraryFilter}
              onChange={(_event, nextValue) => {
                if (nextValue) {
                  setLibraryFilter(nextValue)
                  setPage(1)
                }
              }}
              sx={{ flex: '1 1 150px', minWidth: 0 }}
            >
              <Option value="importable">Importable only</Option>
              <Option value="already-in-library">Already in library</Option>
              <Option value="all">All Steam titles</Option>
            </Select>
            <Select
              size="sm"
              value={playtimeFilter}
              onChange={(_event, nextValue) => {
                if (nextValue) {
                  setPlaytimeFilter(nextValue)
                  setPage(1)
                }
              }}
              sx={{ flex: '1 1 150px', minWidth: 0 }}
            >
              <Option value="all">Any playtime</Option>
              <Option value="recently-played">Recently played</Option>
              <Option value="played">Played before</Option>
              <Option value="unplayed">Never played</Option>
            </Select>
            <Select
              size="sm"
              value={sortOption}
              onChange={(_event, nextValue) => {
                if (nextValue) {
                  setSortOption(nextValue)
                  setPage(1)
                }
              }}
              sx={{ flex: '1 1 150px', minWidth: 0 }}
            >
              <Option value="recommended">Recommended order</Option>
              <Option value="most-played">Most played</Option>
              <Option value="least-played">Least played</Option>
              <Option value="recently-played">Recently played</Option>
            </Select>
          </Stack>
        </Stack>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="flex-end"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            {filteredGames.length === 0
              ? '0 results'
              : `Showing ${pageStartIndex + 1}-${Math.min(pageStartIndex + pageGames.length, filteredGames.length)} of ${filteredGames.length}`}
          </Typography>
          {sortOption === 'recommended' && steamPageMetadataLoading ? (
            <Chip size="sm" color="neutral" variant="soft">
              Sorting single-player titles last...
            </Chip>
          ) : null}
        </Stack>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            {selectedSourceIds.length} selected
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
          >
            <Button
              size="sm"
              variant="outlined"
              color="neutral"
              disabled={currentPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Typography
              level="body-sm"
              sx={{ color: 'neutral.400', minWidth: 72, textAlign: 'center' }}
            >
              Page {currentPage} of {totalPages}
            </Typography>
            <Button
              size="sm"
              variant="outlined"
              color="neutral"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              Next
            </Button>
          </Stack>
        </Stack>
      </Stack>

      {pageGames.length > 0 ? (
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
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <Stack spacing={0.75}>
            {pageGames.map((game) => {
              const selected = selectedSourceIdSet.has(game.sourceId)
              const options =
                selectionOptions[game.sourceId] ??
                buildDefaultSteamImportSelection(game)
              const showOptions =
                selected &&
                !game.alreadyInLibrary &&
                expandedSourceIdSet.has(game.sourceId)
              const gameplayClassification =
                steamDetailsBySourceId[game.sourceId]?.gameplay
                  .classification ?? game.gameplayClassification

              return (
                <SteamImportRow
                  key={game.sourceId}
                  game={game}
                  gameplayClassification={gameplayClassification}
                  selected={selected}
                  options={options}
                  showOptions={showOptions}
                  currentUsualAvailability={currentUsualAvailability}
                  importing={importing}
                  onToggleSelection={toggleSelection}
                  onToggleExpanded={toggleExpanded}
                  onUpdateSelectionOptions={updateSelectionOptions}
                />
              )
            })}
          </Stack>
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

function SteamImportRow({
  game,
  gameplayClassification,
  selected,
  options,
  showOptions,
  currentUsualAvailability,
  importing,
  onToggleSelection,
  onToggleExpanded,
  onUpdateSelectionOptions,
}: {
  game: SteamLibraryImportGame
  gameplayClassification: SteamLibraryImportGame['gameplayClassification']
  selected: boolean
  options: SteamImportSelection
  showOptions: boolean
  currentUsualAvailability: string | null
  importing: boolean
  onToggleSelection: (game: SteamLibraryImportGame) => void
  onToggleExpanded: (sourceId: string) => void
  onUpdateSelectionOptions: (
    sourceId: string,
    updater: (current: SteamImportSelection) => SteamImportSelection,
  ) => void
}) {
  const { gameDetailsViewProps } = useDashboardContext()
  const platformOptions = [
    ...new Set([
      ...steamImportPlatformOptions,
      ...game.platformLabels,
      ...options.platformLabels,
    ]),
  ]

  return (
    <Sheet
      variant="soft"
      sx={{
        p: 0.75,
        borderRadius: 'md',
        border: '1px solid #272f3c',
        cursor: game.alreadyInLibrary ? 'default' : 'pointer',
      }}
      onClick={() => onToggleSelection(game)}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Checkbox
          size="sm"
          checked={game.alreadyInLibrary || selected}
          disabled={game.alreadyInLibrary || importing}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggleSelection(game)}
        />
        <Box
          component="button"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            gameDetailsViewProps.openGameDetails({
              source: 'steam',
              sourceId: game.sourceId,
              title: game.title,
              coverUrl: game.coverUrl,
              platformLabels: game.platformLabels,
            })
          }}
          sx={{
            width: 56,
            height: 32,
            borderRadius: 'sm',
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.08)',
            flexShrink: 0,
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {game.coverUrl ? (
            <DashboardDeferredImage
              src={game.coverUrl}
              alt={game.title}
              rootMargin="240px 0px"
            />
          ) : null}
        </Box>
        <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap' }}
            alignItems="center"
          >
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              onClick={(event) => {
                event.stopPropagation()
                gameDetailsViewProps.openGameDetails({
                  source: 'steam',
                  sourceId: game.sourceId,
                  title: game.title,
                  coverUrl: game.coverUrl,
                  platformLabels: game.platformLabels,
                })
              }}
              sx={{
                px: 0,
                py: 0,
                minHeight: 0,
                justifyContent: 'flex-start',
                color: 'neutral.100',
                fontSize: 'sm',
                fontWeight: 'lg',
              }}
            >
              {game.title}
            </Button>
            {gameplayClassification === 'singleplayer-only' ? (
              <Chip size="sm" color="warning" variant="soft">
                Single-player
              </Chip>
            ) : null}
            {game.alreadyInLibrary ? (
              <Chip size="sm" color="success" variant="soft">
                Already in library
              </Chip>
            ) : null}
            {selected && !game.alreadyInLibrary ? (
              <Chip size="sm" variant="soft" color="primary">
                {formatLibraryIntentLabel(options.intent)}
              </Chip>
            ) : null}
          </Stack>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ flexWrap: 'wrap' }}
            alignItems="center"
            useFlexGap
          >
            <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
              {options.platformLabels.join(', ')}
            </Typography>
            <Chip size="sm" variant="outlined" color="neutral">
              {formatSteamPlaytime(game.minutesPlayedTotal)}
            </Chip>
            {game.minutesPlayedRecent > 0 ? (
              <Chip size="sm" variant="outlined" color="neutral">
                {formatSteamPlaytime(game.minutesPlayedRecent)} last 2 weeks
              </Chip>
            ) : null}
            {selected &&
            !game.alreadyInLibrary &&
            options.availability?.trim() ? (
              <Chip size="sm" variant="outlined" color="neutral">
                {options.availability.trim()}
              </Chip>
            ) : null}
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
        <Stack
          spacing={1.25}
          sx={{ mt: 1, pl: { xs: 0, sm: 5 } }}
          onClick={(event) => event.stopPropagation()}
        >
          <Stack spacing={1}>
            <Typography level="title-sm">Platform</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Choose every platform where you actually play this game.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {platformOptions.map((platform) => {
                const platformSelected =
                  options.platformLabels.includes(platform)

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
                            platformLabels: current.platformLabels.filter(
                              (entry) => entry !== platform,
                            ),
                          }
                        }

                        return {
                          ...current,
                          platformLabels: [...current.platformLabels, platform],
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
              {(['interested', 'wishlist', 'playing-now'] as const).map(
                (intent) => (
                  <Button
                    key={intent}
                    size="sm"
                    variant={options.intent === intent ? 'solid' : 'outlined'}
                    color={options.intent === intent ? 'primary' : 'neutral'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onUpdateSelectionOptions(game.sourceId, (current) => ({
                        ...current,
                        intent,
                      }))
                    }}
                  >
                    {formatLibraryIntentLabel(intent)}
                  </Button>
                ),
              )}
            </Stack>
          </Stack>
          <Stack spacing={1}>
            <Typography level="title-sm">
              Game-specific schedule override
            </Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Leave this blank to use your profile schedule. Only fill it in
              when this game usually happens at a different time.
            </Typography>
            <Input
              placeholder={
                currentUsualAvailability
                  ? `Usually ${currentUsualAvailability}`
                  : 'Example: Friday nights'
              }
              value={options.availability ?? ''}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                onUpdateSelectionOptions(game.sourceId, (current) => ({
                  ...current,
                  availability: event.target.value,
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
  error,
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
  platformAliases,
  gameAliases,
  aliasSavingKey,
  onSavePlatformAlias,
  onDeletePlatformAlias,
  onSaveGameAlias,
  onDeleteGameAlias,
  libraryGameIds,
  addingLibraryGameId,
  editingLibraryEntryId,
  removingLibraryEntryId,
  onEditLibraryEntry,
  onRemoveLibraryEntry,
  onAddGameToLibrary,
}: {
  error: string | null
  isSignedIn: boolean
  steamImportEnabled: boolean
  steamConnected: boolean
  steamLinkPending: boolean
  steamPreviewLoading: boolean
  steamImporting: boolean
  steamDisconnectPending: boolean
  isSteamImportModalOpen: boolean
  steamImportPreview: SteamLibraryImportPreviewResponse | null
  onStartSteamLink: () => Promise<void>
  onOpenSteamImport: () => Promise<void>
  onCloseSteamImport: () => void
  onRefreshSteamImport: () => Promise<void>
  onImportSteamGames: (
    games: ImportSteamLibrarySelectionRequest['games'],
  ) => Promise<void>
  onDisconnectSteam: () => Promise<void>
  usualAvailability: string
  profileSaving: boolean
  usualAvailabilityChanged: boolean
  usualAvailabilityButtonLabel: string
  usualAvailabilityHelperText: string
  onUsualAvailabilityChange: (value: string) => void
  onSaveUsualAvailability: () => Promise<void>
  isLibraryEditorOpen: boolean
  openLibraryEditor: () => void
  closeLibraryEditor: () => void
  editingLibraryEntry: LibraryEntry | null
  libraryTitle: string
  onLibraryTitleChange: (value: string) => void
  selectedCatalogResult: GameSearchResult | null
  gameSuggestions: GameSearchResponse['results']
  gameSuggestionsLoading: boolean
  onSelectSuggestion: (result: GameSearchResult) => void
  platformOptions: string[]
  selectedPlatformLabels: string[]
  onTogglePlatformLabel: (platform: string) => void
  libraryIntent: LibraryEntryIntent
  onLibraryIntentChange: (intent: LibraryEntryIntent) => void
  currentUsualAvailability: string | null
  libraryAvailability: string
  onLibraryAvailabilityChange: (value: string) => void
  librarySaving: boolean
  onAddLibraryEntry: () => Promise<void>
  onCancelLibraryEdit: () => void
  libraryEntries: LibraryEntry[]
  suggestedGames: LibrarySuggestedGame[]
  platformAliases: UserPlatformAlias[]
  gameAliases: UserGameAlias[]
  aliasSavingKey: string | null
  onSavePlatformAlias: (platform: string, aliasValue: string) => Promise<void>
  onDeletePlatformAlias: (platform: string) => Promise<void>
  onSaveGameAlias: (gameId: string, aliasValue: string) => Promise<void>
  onDeleteGameAlias: (gameId: string) => Promise<void>
  libraryGameIds: ReadonlySet<string>
  addingLibraryGameId: string | null
  editingLibraryEntryId: string | null
  removingLibraryEntryId: string | null
  onEditLibraryEntry: (entry: LibraryEntry) => void
  onRemoveLibraryEntry: (entryId: string) => Promise<void>
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>
}) {
  if (error) {
    return <DashboardApiIssueCard error={error} />
  }

  const gameAliasByGameId = new Map(
    gameAliases.map((alias) => [alias.gameId, alias.aliasValue]),
  )
  const editorGameAlias = editingLibraryEntry
    ? (gameAliasByGameId.get(editingLibraryEntry.gameId) ?? null)
    : null

  if (!isSignedIn) {
    return (
      <SignedOutEmptyState
        title="Sign in to build your library"
        description="Library management becomes available after Discord sign-in. Once you are signed in, this tab is where you add games manually, import from Steam, and manage schedule defaults."
      />
    )
  }

  const librarySections = [
    {
      id: 'library-section',
      label: 'Library',
      ariaLabel: 'Library section',
    },
    {
      id: 'usual-availability',
      label: 'When You Play',
      mobileLabel: 'Schedule',
      ariaLabel: 'When do you usually play section',
    },
    {
      id: 'aliases',
      label: 'Aliases',
      ariaLabel: 'Aliases section',
    },
  ]

  return (
    <Stack spacing={3}>
      <SectionNav
        aria-label="Library sections"
        mb={0}
        sections={librarySections}
      />

      <DashboardModal
        open={isLibraryEditorOpen}
        onClose={closeLibraryEditor}
        width="min(96vw, 760px)"
      >
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
          gameAlias={editorGameAlias}
          aliasSaving={Boolean(
            editingLibraryEntry &&
            aliasSavingKey === `game:${editingLibraryEntry.gameId}`,
          )}
          onSaveGameAlias={onSaveGameAlias}
          onDeleteGameAlias={onDeleteGameAlias}
          librarySaving={librarySaving}
          onAddLibraryEntry={onAddLibraryEntry}
          onCancelLibraryEdit={onCancelLibraryEdit}
        />
      </DashboardModal>

      <DashboardModal
        open={isSteamImportModalOpen}
        onClose={onCloseSteamImport}
        width="min(96vw, 860px)"
      >
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

      <Box
        id="library-section"
        sx={{ scrollMarginTop: sectionScrollMarginTop }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Box>
              <Typography level="h2">Your Library</Typography>
              <Typography
                level="body-md"
                sx={{ color: 'neutral.300', mt: 0.5 }}
              >
                Add games to your library to be able to discover others who
                share your interests.
              </Typography>
            </Box>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1}
              sx={{ width: { xs: '100%', md: 'auto' } }}
            >
              <Button
                color="primary"
                variant="outlined"
                onClick={() => void onOpenSteamImport()}
                sx={{
                  flex: { xs: 1, md: '0 0 auto' },
                  minWidth: { xs: 0, md: 170 },
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                Import from Steam
              </Button>
              <Button
                color="primary"
                onClick={openLibraryEditor}
                sx={{
                  flex: { xs: 1, md: '0 0 auto' },
                  minWidth: { xs: 0, md: 188 },
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                Add game to library
              </Button>
            </Stack>
          </Stack>

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
            <EmptyState
              icon={<SportsEsportsRoundedIcon />}
              title="Your library is still empty"
              description="Add or import the games you care about."
            />
          )}
        </Stack>
      </Box>

      <Box
        id="usual-availability"
        sx={{ scrollMarginTop: sectionScrollMarginTop }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography level="h3">When do you usually play?</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
              Set one default schedule at the user level. Individual games can
              still carry their own override when they differ.
            </Typography>
          </Box>

          <UsualAvailabilityCard
            usualAvailability={usualAvailability}
            profileSaving={profileSaving}
            usualAvailabilityChanged={usualAvailabilityChanged}
            usualAvailabilityButtonLabel={usualAvailabilityButtonLabel}
            usualAvailabilityHelperText={usualAvailabilityHelperText}
            onUsualAvailabilityChange={onUsualAvailabilityChange}
            onSaveUsualAvailability={onSaveUsualAvailability}
          />
        </Stack>
      </Box>

      <Box id="aliases" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
        <Stack spacing={2}>
          <Box>
            <Typography level="h3">Aliases</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
              Save your platform-specific handles. Game-specific aliases are
              edited directly in each game card below.
            </Typography>
          </Box>

          <AliasManagementCard
            libraryEntries={libraryEntries}
            platformAliases={platformAliases}
            savingKey={aliasSavingKey}
            onSavePlatformAlias={onSavePlatformAlias}
            onDeletePlatformAlias={onDeletePlatformAlias}
          />
        </Stack>
      </Box>
    </Stack>
  )
}

export function LibraryView() {
  const { libraryViewProps } = useDashboardContext()

  return <LibraryViewContent {...libraryViewProps} />
}
