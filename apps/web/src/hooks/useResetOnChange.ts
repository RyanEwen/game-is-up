/**
 * Reset local state when some values change, during render rather than in an effect.
 *
 * This is React's documented pattern for "adjusting state when a prop changes": the component
 * remembers the values it last rendered with, and when they differ it calls `reset`, whose state
 * updates React applies before the browser paints. An effect would do the same one render later,
 * so the stale values would flash for a frame (and the React Compiler lint flags it).
 *
 * `reset` is not called on the first render: state should start out already equal to what a
 * reset would produce, so give each `useState` the same initial value or initialiser.
 */
import { useState } from 'react'

/**
 * Call `reset` during render whenever any of `values` differs (by `Object.is`) from the values
 * of the previous render.
 * @param values What the state depends on, like an effect's dependency list.
 * @param reset Sets the state back; it may read the current props. It runs during render, so it
 *   must only call this component's state setters.
 */
export function useResetOnChange(
  values: readonly unknown[],
  reset: () => void,
): void {
  const [previous, setPrevious] = useState(values)

  const changed =
    previous.length !== values.length ||
    values.some((value, index) => !Object.is(value, previous[index]))

  if (changed) {
    setPrevious(values)
    reset()
  }
}
