import { Box, Button, Card, Chip, Stack, Typography } from '@mui/joy'
import type { LibraryEntry } from '@game-is-up/shared'
import { AvailabilityChip } from './AvailabilityChip'
import { formatLibraryIntentLabel } from './dashboardUtils'

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
      variant="outlined"
      sx={{
        p: 0,
        overflow: 'hidden',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(13, 18, 30, 0.82)',
        backdropFilter: 'blur(12px)',
        height: '100%'
      }}
    >
      <Box
        sx={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: 'linear-gradient(160deg, rgba(28, 171, 132, 0.32), rgba(11, 16, 32, 0.82) 58%, rgba(244, 178, 63, 0.28))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {entry.coverUrl ? (
          <Box component="img" src={entry.coverUrl} alt={entry.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Stack
            justifyContent="flex-end"
            sx={{
              height: '100%',
              p: 2,
              background: 'linear-gradient(180deg, rgba(7, 11, 20, 0.08), rgba(7, 11, 20, 0.5))'
            }}
          >
            <Typography level="title-md" sx={{ color: 'common.white', textShadow: '0 2px 16px rgba(0, 0, 0, 0.55)' }}>
              {entry.title}
            </Typography>
          </Stack>
        )}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(7, 11, 20, 0.05), rgba(7, 11, 20, 0.68))',
            pointerEvents: 'none'
          }}
        />
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