const legacyTimezoneIdMap: Record<string, string> = {
  UTC: 'Etc/UTC',
  GMT: 'Etc/UTC',
  'UTC-8': 'America/Los_Angeles',
  'GMT-8': 'America/Los_Angeles',
  'UTC-7': 'America/Denver',
  'GMT-7': 'America/Denver',
  'UTC-6': 'America/Chicago',
  'GMT-6': 'America/Chicago',
  'UTC-5': 'America/New_York',
  'GMT-5': 'America/New_York',
  'UTC-4': 'America/Halifax',
  'GMT-4': 'America/Halifax',
  'UTC-3': 'America/Sao_Paulo',
  'GMT-3': 'America/Sao_Paulo',
  'UTC-2': 'America/Noronha',
  'GMT-2': 'America/Noronha',
  'UTC-1': 'Atlantic/Azores',
  'GMT-1': 'Atlantic/Azores',
  'UTC+1': 'Europe/Paris',
  'GMT+1': 'Europe/Paris',
  'UTC+2': 'Europe/Helsinki',
  'GMT+2': 'Europe/Helsinki',
  'UTC+3': 'Europe/Moscow',
  'GMT+3': 'Europe/Moscow',
  'UTC+4': 'Asia/Dubai',
  'GMT+4': 'Asia/Dubai',
  'UTC+5': 'Asia/Karachi',
  'GMT+5': 'Asia/Karachi',
  'UTC+5:30': 'Asia/Kolkata',
  'GMT+5:30': 'Asia/Kolkata',
  'UTC+6': 'Asia/Dhaka',
  'GMT+6': 'Asia/Dhaka',
  'UTC+7': 'Asia/Bangkok',
  'GMT+7': 'Asia/Bangkok',
  'UTC+8': 'Asia/Singapore',
  'GMT+8': 'Asia/Singapore',
  'UTC+9': 'Asia/Tokyo',
  'GMT+9': 'Asia/Tokyo',
  'UTC+10': 'Australia/Sydney',
  'GMT+10': 'Australia/Sydney',
  'UTC+11': 'Pacific/Noumea',
  'GMT+11': 'Pacific/Noumea',
  'UTC+12': 'Pacific/Auckland',
  'GMT+12': 'Pacific/Auckland',
}

function canonicalizeTimezoneId(timezoneId: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneId,
    }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

export function normalizeTimezoneId(
  timezoneId: string | null | undefined,
): string | null {
  const normalizedTimezoneId = timezoneId?.trim()

  if (!normalizedTimezoneId) {
    return null
  }

  const mappedTimezoneId =
    legacyTimezoneIdMap[normalizedTimezoneId.toUpperCase()] ??
    normalizedTimezoneId

  return canonicalizeTimezoneId(mappedTimezoneId)
}

export function formatTimezoneLabel(
  timezoneId: string | null | undefined,
): string {
  const normalizedTimezoneId = normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimezoneId,
    timeZoneName: 'short',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value

  if (timeZoneName?.trim()) {
    return timeZoneName
  }

  if (normalizedTimezoneId === 'Etc/UTC') {
    return 'UTC'
  }

  return (
    normalizedTimezoneId.split('/').at(-1)?.replace(/_/g, ' ') ??
    normalizedTimezoneId
  )
}
