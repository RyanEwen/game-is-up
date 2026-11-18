/**
 * Catches render-time crashes anywhere in the app and shows a recoverable fallback instead of
 * a blank page (LOG-7). The error is logged to the browser console, the only log a web client
 * has (there is no crash reporting, LOG-9). Shape follows persistent's ErrorBoundary.
 *
 * It sits above the dashboard's theme provider, so the fallback brings its own, in the
 * default theme.
 */
// React in scope: the root test runner compiles .tsx with the classic JSX transform.
import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, CssBaseline, Sheet, Typography } from '@mui/joy'
import { CssVarsProvider } from '@mui/joy/styles'
import { appThemeVariants, DEFAULT_APP_THEME } from '../theme/themes'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <CssVarsProvider
        theme={appThemeVariants[DEFAULT_APP_THEME].theme}
        defaultMode="dark"
      >
        <CssBaseline />
        <Box
          role="alert"
          sx={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
          }}
        >
          <Sheet
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 'md',
              maxWidth: 420,
              textAlign: 'center',
            }}
          >
            <Typography level="title-lg" sx={{ mb: 1 }}>
              Something went wrong
            </Typography>
            <Typography level="body-sm" sx={{ mb: 2 }}>
              Game&apos;s Up hit an unexpected error. Reloading usually fixes
              it.
            </Typography>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Sheet>
        </Box>
      </CssVarsProvider>
    )
  }
}
