/**
 * Hook test for useResetOnChange: no reset on the first render, a reset in the same render when a
 * value changes (so no render ever shows the stale value), and none when the values are equal.
 */
import assert from 'node:assert/strict'
import test, { after, afterEach, before } from 'node:test'
import type { JSDOM } from 'jsdom'
import { installJsdomGlobals } from '../test-utils/jsdom'

let dom: JSDOM
let React: typeof import('react')
let renderHook: typeof import('@testing-library/react').renderHook
let cleanup: typeof import('@testing-library/react').cleanup
let useResetOnChange: typeof import('./useResetOnChange').useResetOnChange

before(async () => {
  dom = installJsdomGlobals()
  React = await import('react')
  const testingLibrary = await import('@testing-library/react')
  renderHook = testingLibrary.renderHook
  cleanup = testingLibrary.cleanup
  useResetOnChange = (await import('./useResetOnChange')).useResetOnChange
})

afterEach(() => {
  cleanup()
})

after(() => {
  dom.window.close()
})

/** A draft that resets to `source` when `source` changes, recording every rendered pair. */
function renderDraft(initialSource: string) {
  const rendered: { source: string; draft: string }[] = []
  let resets = 0
  const view = renderHook(
    ({ source }: { source: string }) => {
      const [draft, setDraft] = React.useState(source)
      useResetOnChange([source], () => {
        resets += 1
        setDraft(source)
      })
      rendered.push({ source, draft })
      return { draft, setDraft }
    },
    { initialProps: { source: initialSource } },
  )
  return { view, rendered, resets: () => resets }
}

test('no reset on the first render', () => {
  const { view, resets } = renderDraft('a')
  assert.equal(view.result.current.draft, 'a')
  assert.equal(resets(), 0)
})

test('a changed value resets in the same render, so the stale draft is never committed', () => {
  const { view, rendered, resets } = renderDraft('a')
  React.act(() => view.result.current.setDraft('edited'))
  view.rerender({ source: 'b' })

  assert.equal(view.result.current.draft, 'b')
  assert.equal(resets(), 1)
  // The last committed render pairs the new source with the reset draft.
  assert.deepEqual(rendered.at(-1), { source: 'b', draft: 'b' })
})

test('an unchanged value keeps the edited state', () => {
  const { view, resets } = renderDraft('a')
  React.act(() => view.result.current.setDraft('edited'))
  view.rerender({ source: 'a' })

  assert.equal(view.result.current.draft, 'edited')
  assert.equal(resets(), 0)
})
