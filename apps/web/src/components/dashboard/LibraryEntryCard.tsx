import { Box, Button, Card, Chip, Stack, Typography } from '@mui/joy'
import type { LibraryEntry } from '@game-is-up/shared'
import { AvailabilityChip } from './AvailabilityChip'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import { formatLibraryIntentLabel, topLevelGridCardSx } from './dashboardUtils'

export function LibraryEntryCard({
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
    <Card
      variant="soft"
      sx={{
        p: 0,
        overflow: 'hidden',
        ...topLevelGridCardSx
      }}
    >
      <Box
        sx={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: 'linear-gradient(160deg, #1a4b56, #121a28 58%, #5b3807)',
          borderBottom: '1px solid #304159'
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
              background: 'linear-gradient(180deg, #131c2b, #121a28)'
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
          <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
            <Typography level="title-md" sx={{ pr: 1 }}>
              {entry.title}
            </Typography>
            {isEditing ? (
              <Chip size="sm" variant="soft" color="success" sx={{ flexShrink: 0 }}>
                Editing
              </Chip>
            ) : null}
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip size="sm" variant="soft" color="primary">
              {formatLibraryIntentLabel(entry.intent)}
            </Chip>
            {entry.platformLabels.map((platformLabel) => (
              <Chip key={platformLabel} size="sm" variant="outlined" color="neutral">
                {platformLabel}
              </Chip>
            ))}
            {entry.availability && entry.availabilitySource === 'game-specific' ? (
              <AvailabilityChip availability={entry.availability} availabilitySource={entry.availabilitySource} showInherited={false} />
            ) : null}
          </Stack>

        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
          <Button size="sm" variant={isEditing ? 'soft' : 'outlined'} color="primary" fullWidth disabled={editDisabled} onClick={() => onEdit(entry)}>
            {isEditing ? 'Editing' : 'Edit'}
          </Button>
          <Button size="sm" variant="outlined" color="neutral" fullWidth disabled={isRemoving} onClick={() => void onRemove(entry.id)}>
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        </Stack>
      </Stack>
    </Card>
  )
}