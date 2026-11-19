#!/usr/bin/env node
/**
 * The container side of `npm run dev` (`dev:container`): devkit's generated runner starts it
 * inside the dev container once the checkout's database and ports are set up.
 *
 * Waits for PostgreSQL, generates the Prisma client, then prepares the database: for
 * `npm run dev:fresh` (DEVKIT_FRESH=1) devkit has already dropped and recreated this worktree's
 * database empty, so the checked-in migrations are applied and the sample data seeded; otherwise
 * pending migrations are applied (baselining an older unmanaged database first). Then it builds
 * the shared package and runs the shared, API and web watchers together.
 */
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const fresh = process.env.DEVKIT_FRESH === '1'

/** Run one npm script to completion, exiting with its status if it fails. */
function runNpm(...args) {
  const result = spawnSync('npm', ['run', ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

// Database preparation.
runNpm('db:wait')
runNpm('db:generate')
if (fresh) {
  // The database is empty (devkit recreated it), so migrations build the schema; no
  // `db push --force-reset`, which Prisma 7 refuses under an AI agent.
  runNpm('db:migrate:deploy')
  runNpm('db:seed')
} else {
  runNpm('db:migrate:bootstrap')
}

// The API and web import the shared package's build output.
runNpm('build', '--workspace', '@game-is-up/shared')

const watchers = [
  ['shared', 'magenta', 'npm run dev --workspace @game-is-up/shared'],
  ['api', 'green', 'npm run dev --workspace @game-is-up/api'],
  ['web', 'blue', 'npm run dev --workspace @game-is-up/web'],
]

const child = spawn(
  'npx',
  [
    'concurrently',
    '-n',
    watchers.map((watcher) => watcher[0]).join(','),
    '-c',
    watchers.map((watcher) => watcher[1]).join(','),
    ...watchers.map((watcher) => watcher[2]),
  ],
  { cwd: repoRoot, env: process.env, stdio: 'inherit' },
)

// Signals already reach the foreground process group, so only relay concurrently's exit result.
child.on('exit', (code) => process.exit(code ?? 0))
