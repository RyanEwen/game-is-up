export function formatRelativeTime(date: Date): string {
  const deltaMs = Date.now() - date.getTime()
  const deltaMinutes = Math.max(1, Math.round(deltaMs / (60 * 1000)))

  if (deltaMinutes < 60) {
    return `Active ${deltaMinutes} minute${deltaMinutes === 1 ? '' : 's'} ago`
  }

  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) {
    return `Active ${deltaHours} hour${deltaHours === 1 ? '' : 's'} ago`
  }

  const deltaDays = Math.round(deltaHours / 24)
  return `Active ${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`
}
