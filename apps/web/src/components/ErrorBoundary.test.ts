/** Render test: a crashing component shows the recoverable fallback and logs the error. */
import assert from 'node:assert/strict'
import test, { after, before, mock } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../test-utils/jsdom'

let dom: JSDOM
let createElement: typeof import('react').createElement
let render: typeof import('@testing-library/react').render
let cleanup: typeof import('@testing-library/react').cleanup
let ErrorBoundary: typeof import('./ErrorBoundary').ErrorBoundary

before(async () => {
  // jsdom before Joy, which detects the environment at import time.
  dom = installJsdomGlobals()
  createElement = (await import('react')).createElement
  const testingLibrary = await import('@testing-library/react')
  render = testingLibrary.render
  cleanup = testingLibrary.cleanup
  ErrorBoundary = (await import('./ErrorBoundary')).ErrorBoundary
})

after(() => {
  cleanup()
  dom.window.close()
})

function Crash(): never {
  throw new Error('render failed on purpose')
}

test('a render error shows the fallback with a reload button and is logged', () => {
  const logged: unknown[][] = []
  const consoleError = mock.method(console, 'error', (...args: unknown[]) => {
    logged.push(args)
  })

  try {
    const view = render(
      createElement(ErrorBoundary, null, createElement(Crash)),
    )

    assert.ok(view.getByText('Something went wrong'))
    assert.ok(view.getByRole('button', { name: 'Reload' }))
    assert.ok(
      logged.some(
        (args) =>
          args[0] === 'Unhandled UI error' &&
          (args[1] as Error)?.message === 'render failed on purpose',
      ),
      'the boundary logs the error itself',
    )
  } finally {
    consoleError.mock.restore()
  }
})

test('children render untouched when nothing throws', () => {
  cleanup()
  const view = render(
    createElement(ErrorBoundary, null, createElement('p', null, 'all good')),
  )
  assert.ok(view.getByText('all good'))
})
