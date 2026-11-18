/** Shared validation and wording for optional call-to-play delay estimates, in minutes. */
import { z } from 'zod'

export const runningLateMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(1440)
  .nullable()

/** Validates a form value; a blank estimate means the player is not sure yet. */
export function parseRunningLateMinutes(value: string) {
  return runningLateMinutesSchema.safeParse(
    value.trim() === '' ? null : Number(value),
  )
}

/** Describes an approximate delay without turning an unknown estimate into a promise. */
export function formatRunningLateLabel(minutes?: number | null) {
  if (minutes == null) {
    return 'Running late'
  }

  return `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} late`
}
