import { extendTheme } from '@mui/joy/styles'

export const theme = extendTheme({
  fontFamily: {
    body: 'IBM Plex Sans, sans-serif',
    display: 'Space Grotesk, sans-serif'
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
          level1: 'rgba(18, 25, 39, 0.84)',
          level2: '#111826',
          level3: '#1a2334'
        }
      }
    }
  },
  radius: {
    sm: '10px',
    md: '18px',
    lg: '26px'
  }
})