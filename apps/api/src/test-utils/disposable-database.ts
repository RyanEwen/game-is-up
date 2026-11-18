/**
 * Guard for the database integration tests (`*.integration.test.ts`, run by `npm run
 * test:integration`): they create and delete rows, so they refuse any database whose name
 * does not end in `_test`. With no DATABASE_URL at all they fail too; they never skip.
 */
import assert from 'node:assert/strict'

/** Throw unless DATABASE_URL names an obviously disposable `*_test` database. */
export function assertDisposableDatabase(): void {
  const databaseName = new URL(
    process.env.DATABASE_URL ?? 'postgresql://unset/unset',
  ).pathname.slice(1)

  assert.ok(
    databaseName.endsWith('_test'),
    `Refusing database tests outside a disposable *_test database (got "${databaseName}")`,
  )
}
