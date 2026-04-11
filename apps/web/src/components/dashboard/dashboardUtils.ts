import type { LibraryEntryIntent, PlayIntentPreview, PlayIntentSelectionMode } from '@game-is-up/shared'
import type { DashboardTab } from './types'

export const dashboardTabPaths: Record<DashboardTab, string> = {
  overview: '/',
  discovery: '/discovery',
  library: '/library',
  play: '/play'
}

export const minimumPlayIntentDurationMinutes = 15
export const maximumPlayIntentDurationMinutes = 24 * 60
export const playIntentPresetDurations = [60, 120, 240] as const

export const dashboardTabSx = {
  flexGrow: 1,
  minHeight: 52,
  borderRadius: 'lg',
  color: 'neutral.300',
  fontWeight: 'md',
  transition: 'background-color 180ms ease, color 180ms ease, box-shadow 180ms ease',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: 'neutral.100'
  },
  '&.Mui-selected': {
    color: 'primary.200',
    background: 'linear-gradient(180deg, rgba(20, 136, 106, 0.26), rgba(15, 84, 68, 0.18))',
    boxShadow: 'inset 0 0 0 1px rgba(141, 255, 216, 0.16), 0 10px 20px -16px rgba(15, 84, 68, 0.9)'
  }
} as const

export const discoveryGameGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: '16px'
} as const

export const memberGameGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: '12px'
} as const

export const libraryEntryGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: '16px'
} as const

export function getDashboardTabFromPathname(pathname: string): DashboardTab | null {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/'

  switch (normalizedPathname) {
    case '/':
    case '/overview':
      return 'overview'
    case dashboardTabPaths.discovery:
      return 'discovery'
    case dashboardTabPaths.library:
      return 'library'
    case dashboardTabPaths.play:
      return 'play'
    default:
      return null
  }
}

export function formatLibraryIntentLabel(intent: LibraryEntryIntent): string {
  switch (intent) {
    case 'interested':
      return 'Curious'
    case 'wishlist':
      return 'Eager'
    case 'playing-now':
      return 'Actively playing'
    default:
      return 'Curious'
  }
}

export function formatNotifyScopeLabel(scope: PlayIntentPreview['notifyScope']): string {
  switch (scope) {
    case 'discovery-and-friends':
      return 'Discovery + friends'
    default:
      return 'Friends only'
  }
}

export function formatNotifyScopeDescription(scope: PlayIntentPreview['notifyScope']): string {
  switch (scope) {
    case 'discovery-and-friends':
      return 'Anyone on a shared discovery server that both of you opted into can see it, plus people you added as friends. Matching game overlap still applies.'
    default:
      return 'Only people you added as friends can see it, and they still need a matching game overlap.'
  }
}

export function formatPlayIntentSelectionModeLabel(selectionMode: PlayIntentSelectionMode): string {
  return selectionMode === 'library' ? 'Any game in my library' : 'Only selected games'
}

export function formatPlayIntentDurationLabel(durationMinutes: number): string {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} min`
}

export function parsePlayIntentDurationMinutes(value: string): number | null {
  const trimmedValue = value.trim()

  if (!/^\d+$/.test(trimmedValue)) {
    return null
  }

  const durationMinutes = Number(trimmedValue)

  return Number.isInteger(durationMinutes) ? durationMinutes : null
}

export function toLocalDateTimeInputValue(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)

  return localDate.toISOString().slice(0, 16)
}

export function buildPlayIntentEndTimeInputValue(durationMinutes: number, baseDate = new Date()): string {
  return toLocalDateTimeInputValue(new Date(baseDate.getTime() + durationMinutes * 60 * 1000))
}

export function parsePlayIntentEndAt(value: string): Date | null {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function formatDiscordActivityTypeLabel(activityType: 'playing' | 'competing'): string {
  return activityType === 'competing' ? 'Competing in' : 'Playing on Discord'
}