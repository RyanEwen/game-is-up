import { Box, Button, Card, Chip, Stack, Typography } from '@mui/joy'
import type { LibraryEntry } from '@game-is-up/shared'
import { AvailabilityChip } from './AvailabilityChip'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import {
  commonWideGameCoverAspectRatio,
  formatLibraryIntentLabel,
  topLevelGridCardSx,
} from './dashboardUtils'
import { useDashboardContext } from '../../contexts/useDashboardContext'

export function LibraryEntryCard({
  entry,
  isEditing,
  editDisabled,
  isRemoving,
  onEdit,
  onRemove,
}: {
  entry: LibraryEntry
  isEditing: boolean
  editDisabled: boolean
  isRemoving: boolean
  onEdit: (entry: LibraryEntry) => void
  onRemove: (entryId: string) => Promise<void>
}) {
  const { gameDetailsViewProps } = useDashboardContext()

  return (
    <Card
      variant="soft"
      sx={{
        p: 0,
        overflow: 'hidden',
        ...topLevelGridCardSx,
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() =>
          gameDetailsViewProps.openGameDetails({
            source: 'local',
            sourceId: entry.gameId,
            title: entry.title,
            coverUrl: entry.coverUrl,
            platformLabels: entry.platformLabels,
          })
        }
        sx={{
          position: 'relative',
          display: 'block',
          width: '100%',
          aspectRatio: commonWideGameCoverAspectRatio,
          flexShrink: 0,
          overflow: 'hidden',
          background:
            'linear-gradient(160deg, rgba(var(--joy-palette-primary-darkChannel) / 0.85), var(--joy-palette-background-popup) 58%, rgba(var(--joy-palette-warning-darkChannel) / 0.8))',
          borderBottom: '1px solid var(--joy-palette-neutral-700)',
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
          padding: 0,
          textAlign: 'inherit',
          cursor: 'pointer',
        }}
      >
        {entry.coverUrl ? (
          <DashboardDeferredImage src={entry.coverUrl} alt={entry.title} />
        ) : (
          <Stack
            justifyContent="flex-end"
            sx={{
              height: '100%',
              p: 2,
              background:
                'linear-gradient(180deg, var(--joy-palette-background-level1), var(--joy-palette-background-popup))',
            }}
          >
            <Typography level="title-md" sx={{ color: 'common.white' }}>
              {entry.title}
            </Typography>
          </Stack>
        )}
      </Box>

      <Stack spacing={1.5} sx={{ p: 2, height: '100%' }}>
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            justifyContent="space-between"
          >
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              onClick={() =>
                gameDetailsViewProps.openGameDetails({
                  source: 'local',
                  sourceId: entry.gameId,
                  title: entry.title,
                  coverUrl: entry.coverUrl,
                  platformLabels: entry.platformLabels,
                })
              }
              sx={{
                px: 0,
                py: 0,
                minHeight: 0,
                justifyContent: 'flex-start',
                color: 'common.white',
                fontSize: 'md',
                fontWeight: 'lg',
              }}
            >
              {entry.title}
            </Button>
            {isEditing ? (
              <Chip
                size="sm"
                variant="soft"
                color="success"
                sx={{ flexShrink: 0 }}
              >
                Editing
              </Chip>
            ) : null}
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip size="sm" variant="soft" color="primary">
              {formatLibraryIntentLabel(entry.intent)}
            </Chip>
            {entry.platformLabels.map((platformLabel) => (
              <Chip
                key={platformLabel}
                size="sm"
                variant="outlined"
                color="neutral"
              >
                {platformLabel}
              </Chip>
            ))}
            {entry.availability &&
            entry.availabilitySource === 'game-specific' ? (
              <AvailabilityChip
                availability={entry.availability}
                availabilitySource={entry.availabilitySource}
                showInherited={false}
              />
            ) : null}
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
          <Button
            size="sm"
            variant={isEditing ? 'soft' : 'outlined'}
            color="primary"
            fullWidth
            disabled={editDisabled}
            onClick={() => onEdit(entry)}
          >
            {isEditing ? 'Editing' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="outlined"
            color="neutral"
            fullWidth
            disabled={isRemoving}
            onClick={() => void onRemove(entry.id)}
          >
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        </Stack>
      </Stack>
    </Card>
  )
}
