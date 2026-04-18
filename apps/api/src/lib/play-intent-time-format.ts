import { normalizeTimezoneId } from './timezone-label.js'

function resolvePlayIntentTimezoneId(timezoneId: string | null | undefined) {
  return normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'
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
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimezoneId,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(date)

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0')
  const hour = parts.find((part) => part.type === 'hour')?.value ?? ''
  const minute = parts.find((part) => part.type === 'minute')?.value ?? ''
  const dayPeriod = (parts.find((part) => part.type === 'dayPeriod')?.value ?? '').toLowerCase()
  const timeLabel = minute === '00' ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`

  return `${weekday} ${month} ${formatOrdinalDay(day)} at ${timeLabel}`
}

export function formatPlayIntentWindowLabel(
  startsAt: Date,
  endsAt: Date,
  timezoneId: string | null | undefined
) {
  const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / (60 * 1000)))

  return `${formatPlayIntentDateLabel(startsAt, timezoneId)}, for ${formatPlayIntentDurationLabel(durationMinutes)}`
}
