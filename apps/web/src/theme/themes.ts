/**
 * The theme registry: every selectable app theme keyed by its persisted id.
 *
 * Gold Bubble is the app default — the brand-icon theme built from the Gold
 * Up / Gold Ping marks: flat matte warm-ink surfaces (#17181D family) with a
 * quest-gold primary (#F7B733), and no gradients or ambient washes anywhere.
 * Classic (the original teal atmospheric look) lives in `theme.ts`.
 *
 * Gold ramp conventions: 300 is the brand gold (links, selected-tab text,
 * alpha tints); solid primary controls use the literal brand gold with ink
 * text — on this theme the gold IS the call to action, matching the icon.
 * 600-900 darken toward amber-brown so soft/outlined fills read as quiet
 * tinted surfaces rather than glowing. Warning shifts to orange so it stays
 * distinguishable from the gold primary. Nav chrome stays neutral: gold is
 * reserved for controls and accents, not borders or active-tab fills.
 */
import { buildChromeCssVars, createAppTheme, type GameThemePalette } from './buildTheme'
import { classicChrome, classicTheme } from './theme'

export type AppThemeId = 'gold-bubble' | 'classic'

/** Theme applied when a device has no stored (or an unknown) selection. */
export const DEFAULT_APP_THEME: AppThemeId = 'gold-bubble'

// Flat by design: matte fills only — no gradients, no ambient washes.
// 'none' is a valid value for the background/overlay slots these vars feed
// and disables the layer entirely; the paired gradient stops are set to the
// same color so soft primary cards render a flat fill.
const GOLD_BUBBLE_CHROME: GameThemePalette['chrome'] = {
  bodyBackground: '#101117',
  bodyBackgroundColor: '#101117',
  ambientOverlayBase: 'none',
  ambientOverlayGlow: 'none',
  ambientHighlight: 'none',
  ambientSpectrum: 'none',
  heroBackground: 'none',
  heroBorder: 'var(--joy-palette-neutral-700)',
  installCardBackground: '#241d0e',
  installCardBorder: '#3f3a2c',
  tabBarBackground: '#17181d',
  tabBarBorder: '#353742',
  tabBarShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
  tabBarBackdropFilter: 'none',
  tabHoverBackground: 'rgba(255, 255, 255, 0.04)',
  tabHoverColor: 'var(--joy-palette-neutral-100)',
  // Neutral active state: gold stays reserved for primary controls.
  tabSelectedColor: '#ffffff',
  tabSelectedBackground: 'rgba(255, 255, 255, 0.10)',
  tabSelectedShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.14)',
  sectionNavBackground: '#17181d',
  sectionNavBorder: '#353742',
  sectionNavShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
  sectionNavBackdropFilter: 'none',
  sectionNavText: 'var(--joy-palette-neutral-300)',
  sectionNavTextHover: 'var(--joy-palette-neutral-100)',
  sectionNavFocusRing: 'rgba(247, 183, 51, 0.5)',
  sectionNavCount: 'var(--joy-palette-neutral-400)',
  sectionNavSeparator: 'rgba(255, 255, 255, 0.2)',
  toastBackground: '#1b1c25',
  toastBorder: '#3a3d4a',
  modalDialogBackground: '#171821',
  modalDialogBorder: '#3a3d4a',
  primarySoftCardGradientStart: '#241d0e',
  primarySoftCardGradientEnd: '#241d0e'
}

const goldBubbleTheme = createAppTheme({
  // 50-200 are warm creams rather than pale yellows, and 600-900 are
  // deliberately desaturated bronzes: soft/outlined primary controls fill
  // from that range, and fully saturated ambers there read as loud gold
  // slabs instead of quiet tinted surfaces. Only 300-500 carry the literal
  // brand gold.
  primary: {
    50: '#fcf9f0',
    100: '#f6efdd',
    200: '#ecd9a4',
    300: '#f7b733',
    400: '#e9a51d',
    500: '#c88f1a',
    600: '#615641',
    700: '#463f30',
    800: '#332e23',
    900: '#221f17',
    // Brand gold fill with warm dark-amber text - softer than the icon's
    // near-black ink, which read too harsh at button size.
    solidBg: '#f7b733',
    solidColor: '#6b4a08',
    solidHoverBg: '#e9a51d',
    solidActiveBg: '#d29113'
  },
  warning: {
    50: '#fff4e3',
    100: '#ffe4bd',
    200: '#ffcd85',
    300: '#ffb254',
    400: '#fd9c26',
    500: '#e88908',
    600: '#b96c06',
    700: '#8c5205',
    800: '#653b03',
    900: '#472a02'
  },
  neutral: {
    50: '#f7f7f8',
    100: '#ebebee',
    200: '#d2d3d9',
    300: '#b6b8c2',
    400: '#9295a3',
    500: '#6e7180',
    600: '#4d505e',
    700: '#353742',
    800: '#232430',
    900: '#16171f'
  },
  chrome: GOLD_BUBBLE_CHROME,
  background: {
    body: '#101117',
    surface: '#17181d',
    popup: '#1e1f28',
    level1: '#1d1e27',
    level2: '#242531',
    level3: '#2d2e3c'
  },
  text: {
    primary: '#ffffff',
    secondary: '#e2e3e9',
    tertiary: '#c0c2cc',
    icon: '#c0c2cc'
  }
})

export interface AppThemeVariant {
  label: string
  theme: ReturnType<typeof createAppTheme>
  chromeCssVars: Record<string, string>
}

/**
 * Every app theme, keyed by its persisted id. The Record over the full
 * AppThemeId union keeps this exhaustive: adding an id without a variant
 * here fails typecheck.
 */
export const appThemeVariants: Record<AppThemeId, AppThemeVariant> = {
  'gold-bubble': {
    label: 'Gold Bubble',
    theme: goldBubbleTheme,
    chromeCssVars: buildChromeCssVars(GOLD_BUBBLE_CHROME)
  },
  classic: {
    label: 'Classic',
    theme: classicTheme,
    chromeCssVars: buildChromeCssVars(classicChrome)
  }
}

/** Ordered options for theme pickers. */
export const appThemeOptions: ReadonlyArray<{ value: AppThemeId; label: string }> =
  (Object.entries(appThemeVariants) as Array<[AppThemeId, AppThemeVariant]>).map(
    ([value, variant]) => ({ value, label: variant.label })
  )

export function isAppThemeId(value: unknown): value is AppThemeId {
  return typeof value === 'string' && value in appThemeVariants
}
