import { Chip } from '@mui/joy'
import type { AvailabilitySource } from '@game-is-up/shared'

export function AvailabilityChip({
  availability,
  availabilitySource,
  showInherited = true,
  compactGameSpecificLabel = false
}: {
  availability: string | null;
  availabilitySource: AvailabilitySource | null;
  showInherited?: boolean;
  compactGameSpecificLabel?: boolean;
}) {
  if (!availability || !availabilitySource) {
    return null
  }

  if (availabilitySource === 'profile-default' && !showInherited) {
    return null
  }

  const label = availabilitySource === 'game-specific'
    ? compactGameSpecificLabel
      ? availability
      : `This game: ${availability}`
    : `Usually: ${availability}`

  return (
    <Chip size="sm" variant="outlined" color="warning">
      {label}
    </Chip>
  )
}