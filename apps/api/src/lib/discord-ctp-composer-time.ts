/**
 * Text parsing for the Discord call-to-play composer's timing inputs.
 *
 * Discord modals only accept free text, so scheduled start times and custom
 * durations arrive as strings. These helpers parse them without any date
 * library, interpreting wall-clock times in the user's IANA timezone via
 * Intl. Invariants: parsers are pure (caller supplies `now`), never throw on
 * bad input (they return a descriptive error instead), and a time-only input
 * that already passed today rolls forward to tomorrow rather than failing.
 */

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type ComposerStartParseResult =
  | { kind: 'now' }
  | { kind: 'scheduled'; startAt: Date }
  | { kind: 'error'; error: string };

const startFormatHint = 'Try formats like "8pm", "20:30", "tomorrow 19:00", "2026-07-15 20:00", or "in 45m".'

function getZonedParts(timeZone: string, at: Date): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  const parts = new Map(formatter.formatToParts(at).map((part) => [part.type, part.value]))

  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    // Intl renders midnight as "24" in some environments; normalize to 0.
    hour: Number(parts.get('hour')) % 24,
    minute: Number(parts.get('minute'))
  }
}

function getTimeZoneOffsetMs(timeZone: string, at: Date): number {
  const parts = getZonedParts(timeZone, at)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  const atMinutePrecision = Math.floor(at.getTime() / 60000) * 60000

  return asUtc - atMinutePrecision
}

/**
 * Converts a wall-clock time in the given timezone to a UTC instant. Uses the
 * standard two-pass offset guess so DST transitions near the target time
 * resolve to a valid instant instead of drifting by the offset delta.
 */
export function zonedTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  const firstGuess = naiveUtc - getTimeZoneOffsetMs(timeZone, new Date(naiveUtc))
  const secondGuess = naiveUtc - getTimeZoneOffsetMs(timeZone, new Date(firstGuess))

  return new Date(secondGuess)
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function parseTimeToken(token: string): { hour: number; minute: number } | null {
  const meridiemMatch = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)

  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1])
    const minute = meridiemMatch[2] ? Number(meridiemMatch[2]) : 0

    if (rawHour < 1 || rawHour > 12 || minute > 59) {
      return null
    }

    const hour = (rawHour % 12) + (meridiemMatch[3] === 'pm' ? 12 : 0)
    return { hour, minute }
  }

  const clockMatch = token.match(/^(\d{1,2}):(\d{2})$/)

  if (clockMatch) {
    const hour = Number(clockMatch[1])
    const minute = Number(clockMatch[2])

    if (hour > 23 || minute > 59) {
      return null
    }

    return { hour, minute }
  }

  return null
}

function parseRelativeOffsetMinutes(input: string): number | null {
  const match = input.match(/^(?:in\s+|\+)(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/)

  if (!match || (!match[1] && !match[2])) {
    return null
  }

  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)
}

/**
 * Parses a scheduled-start input in the user's timezone. Accepted forms:
 * "now", relative offsets ("in 45m", "in 1h30m", "+2h"), and wall-clock
 * times with an optional day prefix ("8pm", "today 20:30", "tomorrow 19:00",
 * "2026-07-15 20:00").
 */
export function parseComposerStartInput(rawInput: string, timeZoneId: string, now: Date): ComposerStartParseResult {
  const input = rawInput.trim().toLowerCase().replace(/\s+/g, ' ')
  const timeZone = isValidTimeZone(timeZoneId) ? timeZoneId : 'Etc/UTC'

  if (input.length === 0) {
    return { kind: 'error', error: `Enter a start time. ${startFormatHint}` }
  }

  if (input === 'now' || input === 'asap') {
    return { kind: 'now' }
  }

  const relativeMinutes = parseRelativeOffsetMinutes(input)

  if (relativeMinutes != null) {
    if (relativeMinutes === 0) {
      return { kind: 'now' }
    }

    return { kind: 'scheduled', startAt: new Date(now.getTime() + relativeMinutes * 60 * 1000) }
  }

  const dateMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})\s+(.+)$/)
  const dayWordMatch = input.match(/^(today|tomorrow)\s+(.+)$/)
  const timeToken = dateMatch?.[4] ?? dayWordMatch?.[2] ?? input
  const time = parseTimeToken(timeToken)

  if (!time) {
    return { kind: 'error', error: `I couldn't read that start time. ${startFormatHint}` }
  }

  const zonedNow = getZonedParts(timeZone, now)
  let candidate: Date

  if (dateMatch) {
    const month = Number(dateMatch[2])
    const day = Number(dateMatch[3])

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { kind: 'error', error: `That date does not look valid. ${startFormatHint}` }
    }

    candidate = zonedTimeToUtc({ year: Number(dateMatch[1]), month, day, ...time }, timeZone)
  } else {
    candidate = zonedTimeToUtc({ year: zonedNow.year, month: zonedNow.month, day: zonedNow.day, ...time }, timeZone)

    if (dayWordMatch?.[1] === 'tomorrow') {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000)
    } else if (!dayWordMatch && candidate.getTime() <= now.getTime()) {
      // Bare times that already passed today mean "the next occurrence".
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000)
    }
  }

  if (candidate.getTime() <= now.getTime()) {
    return { kind: 'error', error: 'Choose a future start time, or enter "now" to start right away.' }
  }

  return { kind: 'scheduled', startAt: candidate }
}

/**
 * Parses a custom live-window length like "90", "90m", "2h", or "1h30m" into
 * minutes. Range validation stays with the caller so limits live in one
 * place (the play-intent service).
 */
export function parseComposerDurationInput(rawInput: string): { minutes: number } | { error: string } {
  const input = rawInput.trim().toLowerCase().replace(/\s+/g, '')
  const formatHint = 'Try a number of minutes like "90", or "2h" / "1h30m".'

  if (input.length === 0) {
    return { error: `Enter how long the call should stay live. ${formatHint}` }
  }

  const bareMinutes = input.match(/^(\d+)(?:m(?:in(?:ute)?s?)?)?$/)

  if (bareMinutes) {
    return { minutes: Number(bareMinutes[1]) }
  }

  const hoursAndMinutes = input.match(/^(\d+(?:\.\d+)?)h(?:ours?)?(?:(\d+)m(?:in(?:ute)?s?)?)?$/)

  if (hoursAndMinutes) {
    const minutes = Math.round(Number(hoursAndMinutes[1]) * 60) + Number(hoursAndMinutes[2] ?? 0)
    return { minutes }
  }

  return { error: `I couldn't read that length. ${formatHint}` }
}
