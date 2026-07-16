/**
 * Theme engine adapted from PrintStream's buildTheme module: a theme is a
 * palette (Joy color ramps + backgrounds + text) plus a `chrome` block of
 * app-shell treatments (ambient overlays, hero, tab bar, toasts, modals).
 *
 * Chrome values are emitted as `--gu-*` CSS custom properties by
 * buildChromeCssVars and applied at the dashboard root, so shell components
 * style themselves with `var(--gu-...)` and never hardcode per-theme colors.
 * createAppTheme owns the Joy component overrides shared by every theme;
 * anything per-theme must flow through the palette or a chrome slot.
 */
import { extendTheme } from '@mui/joy/styles'

export interface GameThemePalette {
  /**
   * 50-900 color scale, optionally extended with Joy palette overrides such
   * as `solidBg`/`solidColor` for themes whose solid-primary controls do not
   * derive from the scale (e.g. Gold Bubble's gold fill with ink text).
   */
  primary: Record<number | string, string>
  warning: Record<number, string>
  neutral: Record<number, string>
  chrome: {
    /** Page background: gradient/image on body, flat color behind it (also the PWA theme-color). */
    bodyBackground: string
    bodyBackgroundColor: string
    /** First fixed overlay: page-wide vignette layer. */
    ambientOverlayBase: string
    /** Second layer of the first overlay: soft top glow. */
    ambientOverlayGlow: string
    /** Highlight radial blended over the spectrum wash. */
    ambientHighlight: string
    /** Brand spectrum wash (also tints the window-controls titlebar strip). */
    ambientSpectrum: string
    /** Dashboard hero sheet fill and border. */
    heroBackground: string
    heroBorder: string
    /** PWA install prompt card fill and border. */
    installCardBackground: string
    installCardBorder: string
    /** Sticky dashboard tab bar (TabList) treatment. */
    tabBarBackground: string
    tabBarBorder: string
    tabBarShadow: string
    /** 'none' for flat themes; a blur() stack for translucent bars. */
    tabBarBackdropFilter: string
    /** Individual dashboard tab states. */
    tabHoverBackground: string
    tabHoverColor: string
    tabSelectedColor: string
    tabSelectedBackground: string
    tabSelectedShadow: string
    /** Sticky in-page section nav (SectionNav pill). */
    sectionNavBackground: string
    sectionNavBorder: string
    sectionNavShadow: string
    /** 'none' for flat themes; a blur() stack for translucent pills. */
    sectionNavBackdropFilter: string
    sectionNavText: string
    sectionNavTextHover: string
    sectionNavFocusRing: string
    sectionNavCount: string
    sectionNavSeparator: string
    /** Fixed-position toast alerts. */
    toastBackground: string
    toastBorder: string
    modalDialogBackground: string
    modalDialogBorder: string
    /** Gradient stops for soft primary cards. */
    primarySoftCardGradientStart: string
    primarySoftCardGradientEnd: string
  }
  background: {
    body: string
    surface: string
    popup: string
    level1: string
    level2: string
    level3: string
  }
  text: {
    primary: string
    secondary: string
    tertiary: string
    icon: string
  }
}

export function buildChromeCssVars(chrome: GameThemePalette['chrome']): Record<string, string> {
  return {
    '--gu-body-background': chrome.bodyBackground,
    '--gu-body-background-color': chrome.bodyBackgroundColor,
    '--gu-ambient-overlay-base': chrome.ambientOverlayBase,
    '--gu-ambient-overlay-glow': chrome.ambientOverlayGlow,
    '--gu-ambient-highlight': chrome.ambientHighlight,
    '--gu-ambient-spectrum': chrome.ambientSpectrum,
    '--gu-hero-background': chrome.heroBackground,
    '--gu-hero-border': chrome.heroBorder,
    '--gu-install-card-background': chrome.installCardBackground,
    '--gu-install-card-border': chrome.installCardBorder,
    '--gu-tab-bar-background': chrome.tabBarBackground,
    '--gu-tab-bar-border': chrome.tabBarBorder,
    '--gu-tab-bar-shadow': chrome.tabBarShadow,
    '--gu-tab-bar-backdrop-filter': chrome.tabBarBackdropFilter,
    '--gu-tab-hover-background': chrome.tabHoverBackground,
    '--gu-tab-hover-color': chrome.tabHoverColor,
    '--gu-tab-selected-color': chrome.tabSelectedColor,
    '--gu-tab-selected-background': chrome.tabSelectedBackground,
    '--gu-tab-selected-shadow': chrome.tabSelectedShadow,
    '--gu-section-nav-background': chrome.sectionNavBackground,
    '--gu-section-nav-border': chrome.sectionNavBorder,
    '--gu-section-nav-shadow': chrome.sectionNavShadow,
    '--gu-section-nav-backdrop-filter': chrome.sectionNavBackdropFilter,
    '--gu-section-nav-text': chrome.sectionNavText,
    '--gu-section-nav-text-hover': chrome.sectionNavTextHover,
    '--gu-section-nav-focus-ring': chrome.sectionNavFocusRing,
    '--gu-section-nav-count': chrome.sectionNavCount,
    '--gu-section-nav-separator': chrome.sectionNavSeparator,
    '--gu-toast-background': chrome.toastBackground,
    '--gu-toast-border': chrome.toastBorder,
    '--gu-modal-dialog-background': chrome.modalDialogBackground,
    '--gu-modal-dialog-border': chrome.modalDialogBorder,
    '--gu-soft-primary-card-gradient-start': chrome.primarySoftCardGradientStart,
    '--gu-soft-primary-card-gradient-end': chrome.primarySoftCardGradientEnd
  }
}

function buildSoftControlStyles(color: string) {
  return {
    backgroundColor: `var(--joy-palette-${color}-700, var(--joy-palette-neutral-700))`,
    color: `var(--joy-palette-${color}-100, var(--joy-palette-neutral-100))`,
    border: `1px solid var(--joy-palette-${color}-600, var(--joy-palette-neutral-600))`,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    '&:hover': {
      backgroundColor: `var(--joy-palette-${color}-600, var(--joy-palette-neutral-600))`
    },
    '&:active': {
      backgroundColor: `var(--joy-palette-${color}-500, var(--joy-palette-neutral-500))`
    },
    '&.Mui-disabled': {
      backgroundColor: 'var(--joy-palette-neutral-800)',
      color: 'var(--joy-palette-neutral-500)',
      borderColor: 'var(--joy-palette-neutral-700)',
      boxShadow: 'none'
    }
  }
}

function buildInsetSurfaceStyles() {
  return {
    backgroundColor: 'var(--joy-palette-background-surface)',
    borderColor: 'var(--joy-palette-neutral-700)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
  }
}

export function createAppTheme(palette: GameThemePalette) {
  return extendTheme({
    fontFamily: {
      body: 'IBM Plex Sans, sans-serif',
      display: 'Space Grotesk, sans-serif'
    },
    components: {
      JoyButton: {
        styleOverrides: {
          root: ({ ownerState }) => {
            const color = ownerState.color ?? 'neutral'

            if (ownerState.variant === 'soft') {
              return buildSoftControlStyles(color)
            }

            if (ownerState.variant !== 'outlined') {
              return {}
            }

            return {
              backgroundColor: `var(--joy-palette-${color}-800, var(--joy-palette-neutral-800))`,
              borderColor: `var(--joy-palette-${color}-600, var(--joy-palette-neutral-600))`,
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              '&:hover': {
                backgroundColor: `var(--joy-palette-${color}-700, var(--joy-palette-neutral-700))`
              },
              '&:active': {
                backgroundColor: `var(--joy-palette-${color}-600, var(--joy-palette-neutral-600))`
              },
              '&.Mui-disabled': {
                backgroundColor: 'var(--joy-palette-neutral-800)',
                borderColor: 'var(--joy-palette-neutral-700)'
              }
            }
          }
        }
      },
      JoyIconButton: {
        styleOverrides: {
          root: ({ ownerState }) => {
            if (ownerState.variant !== 'soft') {
              return {}
            }

            return buildSoftControlStyles(ownerState.color ?? 'neutral')
          }
        }
      },
      JoyChip: {
        styleOverrides: {
          root: ({ ownerState }) => {
            if (ownerState.variant !== 'soft') {
              return {}
            }

            return buildSoftControlStyles(ownerState.color ?? 'neutral')
          }
        }
      },
      JoyCard: {
        styleOverrides: {
          root: ({ ownerState }) => {
            if (ownerState.variant === 'outlined') {
              return buildInsetSurfaceStyles()
            }

            if (ownerState.variant === 'soft') {
              if (ownerState.color === 'primary') {
                return {
                  background: 'linear-gradient(180deg, var(--gu-soft-primary-card-gradient-start), var(--gu-soft-primary-card-gradient-end))',
                  border: '1px solid var(--joy-palette-primary-600)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
                }
              }

              return {
                backgroundColor: 'var(--joy-palette-background-level1)',
                border: '1px solid var(--joy-palette-neutral-700)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
              }
            }

            return {}
          }
        }
      },
      JoyAvatar: {
        styleOverrides: {
          root: ({ ownerState }) => {
            if (ownerState.variant !== 'soft') {
              return {}
            }

            const color = ownerState.color ?? 'neutral'

            return {
              backgroundColor: `var(--joy-palette-${color}-700, var(--joy-palette-neutral-700))`,
              color: `var(--joy-palette-${color}-100, var(--joy-palette-neutral-100))`,
              border: `1px solid var(--joy-palette-${color}-600, var(--joy-palette-neutral-600))`,
              boxShadow: '0 0 0 1px rgba(7, 11, 20, 0.24)'
            }
          }
        }
      },
      JoySheet: {
        styleOverrides: {
          root: ({ ownerState }) => {
            if (ownerState.variant === 'outlined') {
              return {
                backgroundColor: 'var(--joy-palette-background-level2)',
                borderColor: 'var(--joy-palette-neutral-700)',
                boxShadow: 'none'
              }
            }

            if (ownerState.variant === 'soft') {
              return {
                backgroundColor: 'var(--joy-palette-background-level2)',
                border: '1px solid var(--joy-palette-neutral-700)',
                boxShadow: 'none'
              }
            }

            return {}
          }
        }
      },
      JoyStack: {
        defaultProps: {
          useFlexGap: true
        }
      },
      JoyModalDialog: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--gu-modal-dialog-background)',
            borderColor: 'var(--gu-modal-dialog-border)',
            boxShadow: 'none'
          }
        }
      }
    },
    colorSchemes: {
      dark: {
        palette: {
          primary: palette.primary,
          warning: palette.warning,
          neutral: palette.neutral,
          background: palette.background,
          text: palette.text
        }
      }
    }
  })
}
