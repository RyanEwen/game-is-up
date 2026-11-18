export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

/**
 * Best-effort lookup of the browser's IANA timezone identifier. Returns null
 * when the environment doesn't expose a timezone (older browsers, locked-down
 * webviews, SSR).
 */
export function getBrowserTimeZoneId(): string | null {
  try {
    const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim()

    return timezoneId ? timezoneId : null
  } catch {
    return null
  }
}

/**
 * True when the current page is rendered inside Discord's in-app browser, where
 * we deliberately avoid showing PWA install prompts.
 */
export function getIsDiscordInAppBrowser(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return /discord/i.test(window.navigator.userAgent)
}

/**
 * Decide which install affordance (if any) to expose for the current browser.
 * Returns 'prompt' when we have a captured `beforeinstallprompt` event,
 * 'ios-manual' for iOS Safari (where install requires the share-sheet flow),
 * and null when the browser does not support installation.
 */
export function getInstallSupport(
  installPromptEvent: BeforeInstallPromptEvent | null,
): 'prompt' | 'ios-manual' | null {
  if (typeof window === 'undefined') {
    return null
  }

  if (getIsDiscordInAppBrowser()) {
    return null
  }

  if (installPromptEvent) {
    return 'prompt'
  }

  const userAgent = window.navigator.userAgent.toLowerCase()
  const isiOS = /iphone|ipad|ipod/.test(userAgent)
  const isSafari =
    /safari/.test(userAgent) &&
    !/crios|fxios|edgios|chrome|android/.test(userAgent)

  if (isiOS && isSafari) {
    return 'ios-manual'
  }

  return null
}

/**
 * True when the page is being rendered as an installed PWA (any standalone-ish
 * display mode, or iOS Safari's legacy `navigator.standalone`).
 */
export function getIsInstalledBrowserApp(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const navigator = window.navigator as NavigatorWithStandalone

  return (
    navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}
