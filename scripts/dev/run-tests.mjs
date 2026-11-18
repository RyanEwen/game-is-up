#!/usr/bin/env node
/**
 * Unit test runner: discovers every `*.test.ts` and `*.test.tsx` under apps/,
 * packages/ and scripts/ and runs them through Node's built-in test runner with
 * the tsx loader, so the TypeScript sources are tested directly with no build.
 *
 * Discovery walks the tree instead of listing folders, so a test added in a new
 * folder is picked up without editing this file (TEST-5). Database-backed tests
 * are named `*.integration.test.ts` and are left to `npm run test:integration`,
 * which needs a database and never skips silently (TEST-7). The split is by
 * that suffix, the same key `test:integration` uses, so every test file runs in
 * exactly one suite. They stay under `src/` so the workspace typecheck covers them.
 *
 * Shape follows persistent's and store-sign-controller's scripts/dev/run-tests.mjs;
 * devkit will ship the shared version later.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOTS = ['apps', 'packages', 'scripts']

// Dependencies and build output hold no tests of ours.
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', '.vite'])

// Owned by `npm run test:integration`.
const INTEGRATION_SUFFIX = '.integration.test.ts'

/**
 * Decide whether a file name is a unit test file.
 * @param {string} name File name without its directory.
 * @returns {boolean} True for `*.test.ts` and `*.test.tsx`, except integration tests.
 */
function isUnitTestFile(name) {
  if (name.endsWith(INTEGRATION_SUFFIX)) {
    return false
  }

  return name.endsWith('.test.ts') || name.endsWith('.test.tsx')
}

/**
 * Recursively collect unit test files below a directory.
 * @param {string} dir Directory to walk; a missing directory is skipped.
 * @param {string[]} out Array that matching paths are appended to (mutated).
 */
function findTests(dir, out) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry)) {
      continue
    }

    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      findTests(full, out)
    } else if (isUnitTestFile(entry)) {
      out.push(full)
    }
  }
}

const tests = []
for (const root of ROOTS) {
  findTests(root, tests)
}

// An empty run would report success for nothing checked, so treat it as a failure.
if (tests.length === 0) {
  console.error('No unit test files found.')
  process.exit(1)
}

// The API loads the repo-root .env, which can hold real credentials and the dev database.
// dotenv never overrides a variable that is already set, so these always win: an empty bot
// token disables the Discord client, empty catalog keys disable Steam and RAWG lookups, and
// the database URL points at a port nothing listens on. No unit test can reach a real service.
const UNIT_TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unit-tests@127.0.0.1:1/unit_tests_never_connect',
  DISCORD_BOT_TOKEN: '',
  STEAM_WEB_API_KEY: '',
  RAWG_API_KEY: '',
}

const result = spawnSync('node', ['--import', 'tsx', '--test', ...tests], {
  stdio: 'inherit',
  env: { ...process.env, ...UNIT_TEST_ENV },
})

process.exit(result.status ?? 1)
