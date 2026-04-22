export const playIntentUpdatedFieldLabels = [
  'time',
  'game selection',
  'note',
  'audience',
  'temporary Discord channel'
] as const

export type PlayIntentUpdatedField = (typeof playIntentUpdatedFieldLabels)[number]

const invalidatingAudienceResponseUpdatedFields = new Set<PlayIntentUpdatedField>([
  'time',
  'game selection'
])

export function shouldInvalidatePlayIntentAudienceResponse(updatedFields: readonly string[]) {
  return updatedFields.some((field) => invalidatingAudienceResponseUpdatedFields.has(field as PlayIntentUpdatedField))
}