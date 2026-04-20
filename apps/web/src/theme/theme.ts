import { extendTheme } from '@mui/joy/styles'

export const theme = extendTheme({
  fontFamily: {
    body: 'IBM Plex Sans, sans-serif',
    display: 'Space Grotesk, sans-serif'
  },
  components: {
    JoyButton: {
      styleOverrides: {
        root: ({ ownerState }) => {
          if (ownerState.variant !== 'outlined') {
            return {}
          }

          const color = ownerState.color ?? 'neutral'

          return {
            backgroundColor: `rgba(var(--joy-palette-${color}-mainChannel) / 0.12)`,
            '&:hover': {
              backgroundColor: `rgba(var(--joy-palette-${color}-mainChannel) / 0.18)`
            },
            '&:active': {
              backgroundColor: `rgba(var(--joy-palette-${color}-mainChannel) / 0.24)`
            },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(23, 29, 40, 0.72)'
            }
          }
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
          50: '#fff8eb',
          100: '#ffe7bf',
          200: '#ffd289',
          300: '#ffbb52',
          400: '#ef9c24',
          500: '#c77d13',
          600: '#9a5f0c',
          700: '#72460a',
          800: '#4c2e07',
          900: '#2f1b04'
        },
        neutral: {
          50: '#f8fafc',
          100: '#d9e0ea',
          200: '#b5c0d0',
          300: '#92a1b8',
          400: '#6d7d95',
          500: '#526176',
          600: '#3c4858',
          700: '#272f3c',
          800: '#171d28',
          900: '#0b1020'
        },
        background: {
          body: '#070b14',
          surface: 'rgba(11, 16, 32, 0.84)',
          popup: '#121927',
          level1: 'rgba(15, 22, 34, 0.9)',
          level2: '#22324f',
          level3: '#355076'
        }
      }
    }
  },
})