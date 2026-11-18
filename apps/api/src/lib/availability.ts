export type AvailabilitySource = 'profile-default' | 'game-specific'

export function resolveAvailability(
  gameAvailability: string | null,
  usualAvailability: string | null,
) {
  const normalizedGameAvailability = gameAvailability?.trim()
    ? gameAvailability.trim()
    : null

  if (normalizedGameAvailability) {
    return {
      availability: normalizedGameAvailability,
      availabilitySource: 'game-specific' as AvailabilitySource,
    }
  }

  const normalizedUsualAvailability = usualAvailability?.trim()
    ? usualAvailability.trim()
    : null

  if (normalizedUsualAvailability) {
    return {
      availability: normalizedUsualAvailability,
      availabilitySource: 'profile-default' as AvailabilitySource,
    }
  }

  return {
    availability: null,
    availabilitySource: null,
  }
}
