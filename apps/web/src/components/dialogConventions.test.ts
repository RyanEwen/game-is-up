/**
 * Source-tree guards for this app's dialog policy, on top of web-app-kit's `BackAwareModal`:
 * which dialogs may close on a scrim click, and how `ModalClose` is wired. The kit's lint
 * config (`eslint.config.mjs`) separately keeps every dialog on `BackAwareModal`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readSourceTree } from '../test-utils/sourceTree'

/**
 * The dialogs allowed to close on a click outside them, with how many opted-in dialogs each
 * file may hold. Only an image viewer qualifies, because it holds no work a stray click can
 * destroy. This app has none yet, so the list is empty.
 */
const BACKDROP_DISMISSIBLE = new Map<string, number>()

/**
 * Blank out comments, so PROSE about the prop does not read as a use of it.
 *
 * Every opt-in carries a comment naming `dismissOnBackdropClick` and saying why, and so does any
 * dialog explaining that it deliberately does NOT set it. Scanning raw source finds the word in
 * both, and would fail the build telling whoever wrote the second comment to declare their print
 * dialog an image viewer. Line comments are stripped only where `//` does not follow a `:`, so a
 * `https://` inside a string cannot swallow the rest of its line.
 */
function withoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * A REGRESSION guard: only an image viewer opts back into closing on a scrim click.
 *
 * The opt-in is one word on a JSX element, it silences the app-wide rule for that dialog, and
 * nothing about the result looks wrong -- it just behaves the way Joy did before, which is the
 * behaviour someone reaching for the prop is usually trying to restore. The dialogs where that is
 * most tempting (a picker, a settings catalog, anything with a Cancel) are exactly the ones the rule
 * exists for, so the list is reviewed here rather than left to whoever is mid-task.
 */
test('only image viewers opt back into closing on a scrim click', async () => {
  const unapproved: string[] = []

  for (const file of await readSourceTree()) {
    const relative = file.relativePath
    if (relative.includes('.test.') || relative.includes('.testkit.')) continue

    const source = withoutComments(file.source)
    const uses = source.match(/\bdismissOnBackdropClick\b/g)?.length ?? 0
    if (uses === 0) continue

    const allowed = BACKDROP_DISMISSIBLE.get(relative) ?? 0
    if (uses > allowed)
      unapproved.push(`${relative} (${uses} opted in, ${allowed} approved)`)
  }

  assert.deepEqual(
    unapproved,
    [],
    'A dialog closes only on a deliberate gesture (X, footer button, Escape, Back). If these really ' +
      `are image viewers, raise their count in BACKDROP_DISMISSIBLE:\n  ${unapproved.join('\n  ')}`,
  )
})

/**
 * A REGRESSION guard: `ModalClose` never carries an `onClick`.
 *
 * The button is already wired to the dialog it sits in -- Joy reads the modal's `onClose` off
 * `CloseModalContext` and calls it with `'closeClick'` BEFORE handing the event to any `onClick`
 * the consumer passed. So `<ModalClose onClick={close} />` runs the close path twice per click,
 * and it reads as the obvious way to wire the button up, which is why two surfaces did it.
 *
 * On an unconditional close the second run is an invisible no-op, which is exactly why this has to
 * fail the build rather than be noticed: on a CONDITIONAL close it is not. A dialog that asks
 * "Discard unsaved changes?" would ask it twice for one click on an X wired this way.
 */
test('ModalClose never carries its own onClick', async () => {
  const offenders: string[] = []

  for (const { relativePath: relative, source } of await readSourceTree()) {
    if (relative.includes('.test.') || relative.includes('.testkit.')) continue

    // The element's whole prop list, which routinely wraps across lines.
    for (const match of source.matchAll(/<ModalClose\b[^>]*\/?>/g)) {
      if (!/\bonClick\s*=/.test(match[0]!)) continue
      offenders.push(
        `${relative}:${source.slice(0, match.index).split('\n').length}`,
      )
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `<ModalClose> already calls the modal's onClose; drop the onClick or the dialog closes twice:\n  ${offenders.join('\n  ')}`,
  )
})
