/** Shared optimistic-write failures and strictly advancing timestamp revisions. */

/** The caller must refresh before retrying; a stale form must never silently overwrite new data. */
export class RecordChangedError extends Error {}

/** Advance even within one clock millisecond so an accepted private token cannot be reused. */
export function nextRecordUpdatedAt(expected: Date) {
  return new Date(Math.max(Date.now(), expected.getTime() + 1))
}
