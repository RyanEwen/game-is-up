/**
 * Date/time formatting helpers built on top of `Intl.DateTimeFormat`.
 *
 * `Intl.DateTimeFormat` instances are not free to construct, so this module
 * memoizes them by `(locale, options)` and exposes thin wrappers that accept
 * either a `Date` or an ISO string. The web and API both share these helpers
 * to keep timezone- and locale-aware rendering consistent across surfaces.
 */

export type DateTimeInput = Date | string

type DateTimeLocale = string | string[] | undefined

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function buildFormatterCacheKey(locale: DateTimeLocale, options: Intl.DateTimeFormatOptions) {
  return JSON.stringify({
    locale,
    options: Object.entries(options).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  })
}

function getFormatter(locale: DateTimeLocale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = buildFormatterCacheKey(locale, options)
  const existingFormatter = formatterCache.get(cacheKey)

  if (existingFormatter) {
    return existingFormatter
  }

  const formatter = new Intl.DateTimeFormat(locale, options)
  formatterCache.set(cacheKey, formatter)

  return formatter
}

function resolveDateTimeInput(value: DateTimeInput) {
  return typeof value === 'string' ? new Date(value) : value
}

/**
 * Default to 12-hour clock when the caller asks for a clock-time component
 * but does not pin `hour12`. Game's Up renders friendly Discord-style
 * timestamps that should not flip into 24-hour clocks based on locale alone.
 */
function resolveDateTimeOptions(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const hasClockTime = options.hour != null || options.minute != null || options.second != null || options.timeStyle != null

  if (!hasClockTime || options.hour12 != null) {
    return options
  }

  return {
    ...options,
    hour12: true
  }
}

/**
 * Format a date/time value as a single string using the cached formatter for
 * the given options. See `Intl.DateTimeFormat` for the option shape.
 */
export function formatDateTime(
  value: DateTimeInput,
  options: Intl.DateTimeFormatOptions,
  locale?: DateTimeLocale
): string {
  const resolvedOptions = resolveDateTimeOptions(options)

  return getFormatter(locale, resolvedOptions).format(resolveDateTimeInput(value))
}

/**
 * Like `formatDateTime` but returns the structured part array so callers can
 * pick out specific tokens (for example, the day-of-week vs the time portion)
 * without re-parsing a flat string.
 */
export function formatDateTimeToParts(
  value: DateTimeInput,
  options: Intl.DateTimeFormatOptions,
  locale?: DateTimeLocale
): Intl.DateTimeFormatPart[] {
  const resolvedOptions = resolveDateTimeOptions(options)

  return getFormatter(locale, resolvedOptions).formatToParts(resolveDateTimeInput(value))
}