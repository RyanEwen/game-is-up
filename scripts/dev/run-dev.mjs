#!/usr/bin/env node
/**
 * Starts a checkout-specific Devkit stack. The same runner performs the database preparation and
 * watcher startup when Compose invokes it with `--container-runtime`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkoutCompose,
  checkoutComposeLifecycle,
  inheritWorktreeFiles,
  preflight
} from '@ryanewen/devkit'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const envPath = path.join(repoRoot, '.env')
const fresh = process.argv.includes('--fresh') || process.env.DEVKIT_FRESH === '1'
const teardown = process.argv.includes('--down')
const containerRuntime = process.argv.includes('--container-runtime')

await inheritWorktreeFiles({ repoRoot })

// Match dotenv semantics: explicit shell values win over inherited or checkout-local values.
if (existsSync(envPath)) process.loadEnvFile(envPath)

let hostMode = null
if (!containerRuntime) {
  try {
    hostMode = await preflight({ repoRoot, teardown })
  } catch (error) {
    console.error(`\n[dev] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
  if (!hostMode) {
    console.error('\n[dev] Devkit is not enabled; run `npm run dev:bootstrap` once on this host.\n')
    process.exit(1)
  }
}

if (hostMode) Object.assign(process.env, hostMode.env)

function runSync(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit'
  })

  if (result.status !== 0) process.exit(result.status ?? 1)
}

let composeInvocation = null
let composeLifecycle = null
if (hostMode) {
  composeInvocation = checkoutCompose(hostMode, {
    files: [path.join(repoRoot, 'compose.dev.yml')],
    projectDirectory: repoRoot,
    env: {
      DEVKIT_WEB_PORT: String(hostMode.ports.web),
      DEVKIT_FRESH: fresh ? '1' : '0',
      HOST_UID: String(process.getuid?.() ?? 1000),
      HOST_GID: String(process.getgid?.() ?? 1000)
    }
  })
  composeLifecycle = checkoutComposeLifecycle(hostMode, composeInvocation)
  if (teardown) {
    process.exit(composeLifecycle.stop())
  }
} else {
  runSync('npm', ['run', 'db:wait'])
  runSync('npm', ['run', 'db:generate'])
  if (fresh) {
    runSync('npm', ['run', 'db:push'])
    runSync('npm', ['run', 'db:seed'])
  } else {
    runSync('npm', ['run', 'db:migrate:bootstrap'])
  }
  runSync('npm', ['run', 'build', '--workspace', '@game-is-up/shared'])
}

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

if (composeLifecycle) {
  try {
    process.exit(await composeLifecycle.run(['up', '--build', '--remove-orphans']))
  } catch (error) {
    console.error(`[dev] could not start Docker Compose: ${error.message}`)
    process.exit(1)
  }
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

// Signals already reach the foreground process group, so only relay concurrently's exit result.
child.on('exit', (code) => process.exit(code ?? 0))
