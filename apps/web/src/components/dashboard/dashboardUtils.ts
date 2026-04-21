import type { LibraryEntryIntent, PlayIntentPreview, PlayIntentSelectionMode } from '@game-is-up/shared'
import { formatMonthDayTime } from '../../lib/dateTime'
import type { DashboardTab } from './types'

export const dashboardTabPaths: Record<DashboardTab, string> = {
  overview: '/',
  library: '/library',
  friends: '/friends',
  discovery: '/discovery',
  play: '/play',
  debug: '/debug'
}

export const minimumPlayIntentDurationMinutes = 15
export const maximumPlayIntentDurationMinutes = 24 * 60
export const playIntentPresetDurations = [60, 120, 240] as const

export const dashboardTabSx = {
  flex: '1 1 0',
  minHeight: { xs: 44, sm: 52 },
  minWidth: 0,
  px: { xs: 1.5, sm: 2 },
  borderRadius: 'lg',
  color: 'neutral.300',
  fontSize: { xs: 'sm', sm: 'md' },
  fontWeight: 'md',
  whiteSpace: 'nowrap',
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: '12px'
} as const

export const commonWideGameCoverAspectRatio = '460 / 215' as const

export const topLevelCardSx = {
  borderColor: 'var(--joy-palette-neutral-700)',
  boxShadow: 'none'
} as const

export const topLevelGridCardSx = {
  ...topLevelCardSx,
  height: '100%'
} as const

export const dashedTopLevelCardSx = {
  ...topLevelCardSx,
  border: '1px dashed var(--joy-palette-neutral-700)'
} as const

export const nestedInsetSurfaceSx = {
  backgroundColor: 'var(--joy-palette-background-surface)',
  border: '1px solid var(--joy-palette-neutral-700)',
  boxShadow: 'none'
} as const

export const nestedInsetMediaSx = {
  backgroundColor: '#111827'
} as const

export const headerFilterControlSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  width: { xs: '100%', sm: 'auto' },
  flexWrap: { xs: 'nowrap', sm: 'wrap' }
} as const

export const headerActionFilterStackSx = {
  width: { xs: '100%', sm: 'max-content' },
  minWidth: { xs: 0, sm: 'fit-content' }
} as const

export const headerActionFilterButtonSx = {
  width: '100%'
} as const

export const headerFilterControlMatchActionWidthSx = {
  ...headerFilterControlSx,
  width: '100%',
  justifyContent: { xs: 'flex-start', sm: 'space-between' }
} as const

export function buildHeaderFilterSelectSx(desktopMinWidth: number) {
  return {
    flex: { xs: '1 1 0', sm: '0 0 auto' },
    minWidth: { xs: 0, sm: desktopMinWidth },
    maxWidth: '100%'
  } as const
}

export const libraryEntryGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
  gap: '16px'
} as const

export function getDashboardTabFromPathname(pathname: string): DashboardTab | null {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPathname.startsWith(`${dashboardTabPaths.play}/`)) {
    return 'play'
  }

  switch (normalizedPathname) {
    case '/':
    case '/overview':
      return 'overview'
    case dashboardTabPaths.discovery:
      return 'discovery'
    case dashboardTabPaths.library:
      return 'library'
    case dashboardTabPaths.friends:
      return 'friends'
    case dashboardTabPaths.play:
      return 'play'
    case dashboardTabPaths.debug:
      return 'debug'
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
    case 'network':
      return 'Anyone in your network'
    case 'specific-discord-server':
      return 'Specific Discord servers'
    case 'specific-friends':
      return 'Specific friends'
    default:
      return 'Friends only'
  }
}

export function formatNotifyScopeDescription(scope: PlayIntentPreview['notifyScope']): string {
  switch (scope) {
    case 'network':
      return 'Anyone in your network, plus people you added as friends, where there are matching games.'
    case 'specific-discord-server':
      return 'Only the in-app people from the selected network Discord servers, where there are matching games.'
    case 'specific-friends':
      return 'Only the specific friends you choose, where there are matching games.'
    default:
      return 'Only people you added as friends, where there are matching games.'
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

export function formatPlayIntentTimingSummary(startsAt: string, endsAt: string, baseDate = new Date()): string {
  const startDate = new Date(startsAt)
  const endDate = new Date(endsAt)
  const durationMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (60 * 1000)))
  const prefix = startDate.getTime() > baseDate.getTime() ? 'Scheduled for ' : ''

  return `${prefix}${formatMonthDayTime(startDate)} for ${formatPlayIntentDurationLabel(durationMinutes)}`
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

export function parseLocalDateTimeInput(value: string): Date | null {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function parsePlayIntentEndAt(value: string): Date | null {
  return parseLocalDateTimeInput(value)
}

export function formatDiscordActivityTypeLabel(activityType: 'playing' | 'competing'): string {
  return activityType === 'competing' ? 'Competing in' : 'Playing on Discord'
}

export function formatRelativeTimeShort(dateInput: string | Date, baseDate = new Date()): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  const diffMs = Math.max(0, baseDate.getTime() - date.getTime())
  const diffMinutes = Math.floor(diffMs / (60 * 1000))

  if (diffMinutes < 1) {
    return 'just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)

  if (diffDays < 7) {
    return `${diffDays}d ago`
  }

  const diffWeeks = Math.floor(diffDays / 7)

  if (diffWeeks < 5) {
    return `${diffWeeks}w ago`
  }

  const diffMonths = Math.floor(diffDays / 30)

  if (diffMonths < 12) {
    return `${diffMonths}mo ago`
  }

  const diffYears = Math.floor(diffDays / 365)

  return `${diffYears}y ago`
}