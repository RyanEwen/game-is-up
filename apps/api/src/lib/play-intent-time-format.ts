import { formatDateTimeToParts } from '@game-is-up/shared'
import { normalizeTimezoneId } from './timezone-label.js'

function resolvePlayIntentTimezoneId(timezoneId: string | null | undefined) {
  return normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'
}

function findDateTimePartValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? ''
}

function formatOrdinalDay(dayOfMonth: number) {
  const remainderHundred = dayOfMonth % 100

  if (remainderHundred >= 11 && remainderHundred <= 13) {
    return `${dayOfMonth}th`
  }

  switch (dayOfMonth % 10) {
    case 1:
      return `${dayOfMonth}st`
    case 2:
      return `${dayOfMonth}nd`
    case 3:
      return `${dayOfMonth}rd`
    default:
      return `${dayOfMonth}th`
  }
}

export function formatPlayIntentDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} minutes`
}

export function formatPlayIntentDateLabel(date: Date, timezoneId: string | null | undefined) {
  const normalizedTimezoneId = resolvePlayIntentTimezoneId(timezoneId)
  const parts = formatDateTimeToParts(date, {
    timeZone: normalizedTimezoneId,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }, 'en-US') as Intl.DateTimeFormatPart[]

  const weekday = findDateTimePartValue(parts, 'weekday')
  const month = findDateTimePartValue(parts, 'month')
  const day = Number(findDateTimePartValue(parts, 'day') || '0')
  const timeLabel = formatPlayIntentTimeLabel(date, timezoneId)

  return `${weekday} ${month} ${formatOrdinalDay(day)} at ${timeLabel}`
}

export function formatPlayIntentTimeLabel(date: Date, timezoneId: string | null | undefined) {
  const normalizedTimezoneId = resolvePlayIntentTimezoneId(timezoneId)
  const parts = formatDateTimeToParts(date, {
    timeZone: normalizedTimezoneId,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }, 'en-US') as Intl.DateTimeFormatPart[]

  const hour = findDateTimePartValue(parts, 'hour')
  const minute = findDateTimePartValue(parts, 'minute')
  const dayPeriod = findDateTimePartValue(parts, 'dayPeriod').toLowerCase()
  return minute === '00' ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`
}

export function formatPlayIntentWindowLabel(
  startsAt: Date,
  endsAt: Date,
  timezoneId: string | null | undefined
) {
  const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / (60 * 1000)))

  return `${formatPlayIntentDateLabel(startsAt, timezoneId)}, for ${formatPlayIntentDurationLabel(durationMinutes)}`
}
