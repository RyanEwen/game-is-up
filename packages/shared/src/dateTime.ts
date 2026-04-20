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

export function formatDateTime(
  value: DateTimeInput,
  options: Intl.DateTimeFormatOptions,
  locale?: DateTimeLocale
): string {
  const resolvedOptions = resolveDateTimeOptions(options)

  return getFormatter(locale, resolvedOptions).format(resolveDateTimeInput(value))
}

export function formatDateTimeToParts(
  value: DateTimeInput,
  options: Intl.DateTimeFormatOptions,
  locale?: DateTimeLocale
): Intl.DateTimeFormatPart[] {
  const resolvedOptions = resolveDateTimeOptions(options)

  return getFormatter(locale, resolvedOptions).formatToParts(resolveDateTimeInput(value))
}