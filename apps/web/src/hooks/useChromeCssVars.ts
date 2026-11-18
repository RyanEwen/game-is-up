/**
 * Applies a theme's chrome CSS custom properties to the document root, so
 * shell styles outside the React tree (the body background in index.css)
 * and every `var(--gu-...)` reference resolve to the active theme. Also
 * keeps the `theme-color` meta in sync so the PWA titlebar/window frame
 * matches the theme's page background.
 *
 * Vars are intentionally not removed on unmount: every themed surface sets
 * its own on mount, and leaving the last values in place avoids a flash of
 * the CSS fallbacks during route transitions.
 */
import { useEffect } from 'react'

export function useChromeCssVars(chromeCssVars: Record<string, string>) {
  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(chromeCssVars)) {
      root.style.setProperty(key, value)
    }
    const themeColor = chromeCssVars['--gu-body-background-color']
    if (themeColor) {
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', themeColor)
    }
  }, [chromeCssVars])
}
