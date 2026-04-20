import { extendTheme } from '@mui/joy/styles'

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

export const theme = extendTheme({
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
            return {
              backgroundColor: 'var(--joy-palette-background-surface)',
              borderColor: 'var(--joy-palette-neutral-700)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: 'none'
            }
          }

          if (ownerState.variant === 'soft') {
            return {
              backgroundColor: 'var(--joy-palette-background-level1)',
              border: '1px solid var(--joy-palette-neutral-700)',
              boxShadow: 'none'
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
    }
  },
  colorSchemes: {
    dark: {
      palette: {
        primary: {
          50: '#e6fff6',
          100: '#c2ffea',
          200: '#8dffd8',
          300: '#57f4c1',
          400: '#33d7a6',
          500: '#1cab84',
          600: '#14886a',
          700: '#106a54',
          800: '#0f5444',
          900: '#0d463a'
        },
        warning: {
          50: '#fff9ef',
          100: '#ffe9c8',
          200: '#ffd79f',
          300: '#f2c06e',
          400: '#d89d42',
          500: '#b67c20',
          600: '#8e5f18',
          700: '#6b4714',
          800: '#493112',
          900: '#2c1d0b'
        },
        neutral: {
          50: '#f8fafc',
          100: '#e1e7ef',
          200: '#c1ccda',
          300: '#d3dde7',
          400: '#c4d0dd',
          500: '#687a94',
          600: '#506077',
          700: '#3b4d66',
          800: '#243043',
          900: '#161d2e'
        },
        background: {
          body: '#070b14',
          surface: 'rgba(19, 27, 42, 0.4)',
          popup: '#121a28',
          level1: 'rgba(31, 42, 58, 0.87)',
          level2: '#24364d',
          level3: '#355076'
        },
        text: {
          primary: '#fff',
          secondary: '#d1dbe5',
          tertiary: '#bdcad9',
          icon: '#bdcad9'
        }
      }
    }
  },
})