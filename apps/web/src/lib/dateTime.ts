import { formatDateTime, type DateTimeInput } from '@game-is-up/shared'

export function formatMonthDayTime(value: DateTimeInput): string {
  return formatDateTime(value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatWeekdayMonthDay(value: DateTimeInput): string {
  return formatDateTime(value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

export function formatClockTime(value: DateTimeInput): string {
  return formatDateTime(value, {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatMonthDayYearTimeZone(value: DateTimeInput, timeZone: string): string {
  return formatDateTime(value, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}