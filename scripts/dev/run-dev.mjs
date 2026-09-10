#!/usr/bin/env node
/**
 * Starts the database preflight, checked-in migrations, shared build, and current workspace
 * watchers. Optional devkit host mode overlays checkout-specific ports, database, origin, and
 * proxy routing; devcontainers, fresh clones, and DEVKIT=0 retain the fixed-port behavior.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  inheritWorktreeFiles,
  preflight,
  refreshBaselineAfterMigrations,
  removeRoute
} from '@ryanewen/devkit'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const envPath = path.join(repoRoot, '.env')
const fresh = process.argv.includes('--fresh')

await inheritWorktreeFiles({ repoRoot })

// Match dotenv semantics: explicit shell values win over inherited or checkout-local values.
if (existsSync(envPath)) process.loadEnvFile(envPath)

let hostMode = null
try {
  hostMode = await preflight({ repoRoot })
} catch (error) {
  console.error(`\n[dev] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

if (hostMode) {
  Object.assign(process.env, hostMode.env)
  // Remove a route even when a synchronous startup pre-step fails after preflight registered it.
  process.on('exit', () => removeRoute(hostMode.config, hostMode.identity))
}

function runSync(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit'
  })

  if (result.status !== 0) process.exit(result.status ?? 1)
}

runSync('npm', ['run', 'db:wait'])
if (fresh) {
  // Preserve dev:fresh's reset-and-seed behavior, but only after host mode selects its database.
  runSync('npm', ['run', 'db:push'])
  runSync('npm', ['run', 'db:seed'])
} else {
  runSync('npm', ['run', 'db:migrate:bootstrap'])
}
runSync('npm', ['run', 'build', '--workspace', '@game-is-up/shared'])

const processes = [
  ['shared', 'magenta', 'npm run dev --workspace @game-is-up/shared'],
  ['api', 'green', 'npm run dev --workspace @game-is-up/api'],
  ['web', 'blue', 'npm run dev --workspace @game-is-up/web']
]

if (hostMode) {
  for (const line of hostMode.lines) console.log(`[dev] ${line}`)
  console.log('')
  console.log(`  ${hostMode.identity.repoName}${hostMode.identity.isPrimary ? '' : ` / ${hostMode.identity.worktreeName}`}  ->  ${hostMode.url}`)
  console.log(`  direct${' '.repeat(Math.max(1, hostMode.identity.repoName.length - 5))}  ->  ${hostMode.directUrl}`)
  console.log('')
}

const child = spawn(
  'npx',
  [
    'concurrently',
    '-n', processes.map((process) => process[0]).join(','),
    '-c', processes.map((process) => process[1]).join(','),
    ...processes.map((process) => process[2])
  ],
  { cwd: repoRoot, env: process.env, stdio: 'inherit' }
)

if (hostMode) {
  try {
    refreshBaselineAfterMigrations(hostMode)
  } catch (error) {
    console.log(`[dev] baseline refresh skipped: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Signals already reach the foreground process group, so only relay concurrently's exit result.
child.on('exit', (code) => process.exit(code ?? 0))
