/** Formats displayed dates and rounds suggested local-clock times for form inputs. */
import { formatDateTime, type DateTimeInput } from '@game-is-up/shared'

/** Returns a new date on the nearest local quarter hour; exact halfway points round later. */
export function roundToNearestQuarterHour(date: Date): Date {
  const quarterHourMs = 15 * 60 * 1000
  const elapsedHourMs =
    date.getMinutes() * 60 * 1000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds()
  const roundedHourMs =
    Math.round(elapsedHourMs / quarterHourMs) * quarterHourMs

  // Adjust the instant so repeated daylight-saving hours keep their original offset.
  return new Date(date.getTime() + roundedHourMs - elapsedHourMs)
}

export function formatMonthDayTime(value: DateTimeInput): string {
  return formatDateTime(value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatWeekdayMonthDay(value: DateTimeInput): string {
  return formatDateTime(value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatClockTime(value: DateTimeInput): string {
  return formatDateTime(value, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatMonthDayYearTimeZone(
  value: DateTimeInput,
  timeZone: string,
): string {
  return formatDateTime(value, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
