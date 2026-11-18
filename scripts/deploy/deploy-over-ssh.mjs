#!/usr/bin/env node
/**
 * Deploy the current commit to production over SSH with Docker Compose (SCRIPT-10).
 *
 * Refuses, in this order, before anything reaches the server:
 *   1. a missing target: DEPLOY_SSH_HOST and DEPLOY_REPO_PATH (or --host and --repo-path);
 *   2. uncommitted changes in the local tree;
 *   3. a HEAD that is not exactly `origin/main`, so only a pushed commit on main is deployed.
 * Then it runs the gate (`npm run validate`, unless --skip-validate), and on the server
 * refuses tracked changes in the checkout, fast-forwards it to `origin/main`, and rebuilds
 * the stack. Prisma migrations run when the API container starts.
 *
 * Run with `npm run deploy:prod`, which loads `.env` when it exists. Options:
 *   --host <user@host>      DEPLOY_SSH_HOST
 *   --port <port>           DEPLOY_SSH_PORT (default 22)
 *   --repo-path <path>      DEPLOY_REPO_PATH
 *   --compose-file <path>   DEPLOY_COMPOSE_FILES (comma separated); repeatable. Default:
 *                           compose.yml, plus compose.prod.yml when it exists on the server
 *   --skip-validate         skip the local gate
 *   --dry-run               run the local refusals, then print the plan without validating or deploying
 */
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')

// Production is always the remote's main (SCRIPT-10); there is no branch option.
const deployBranch = 'main'

/**
 * Read the deploy options from the environment, then let flags override them.
 * @param {string[]} argv Arguments after the script name.
 * @returns {{ composeFiles: string[], dryRun: boolean, host: string, port: string, repoPath: string, skipValidate: boolean }}
 */
function parseArgs(argv) {
  const options = {
    composeFiles: parseComposeFiles(process.env.DEPLOY_COMPOSE_FILES),
    dryRun: false,
    host: process.env.DEPLOY_SSH_HOST?.trim() || '',
    port: process.env.DEPLOY_SSH_PORT?.trim() || '22',
    repoPath: process.env.DEPLOY_REPO_PATH?.trim() || '',
    skipValidate: false
  }

  const valueFlags = {
    '--host': (value) => { options.host = value },
    '--port': (value) => { options.port = value },
    '--repo-path': (value) => { options.repoPath = value },
    '--compose-file': (value) => { options.composeFiles.push(value) }
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help') {
      printHelp()
      process.exit(0)
    }

    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (argument === '--skip-validate') {
      options.skipValidate = true
      continue
    }

    // Accept both `--flag value` and `--flag=value`.
    const [name, inlineValue] = argument.split(/=(.*)/su)
    const apply = valueFlags[name]

    if (!apply) {
      throw new Error(`Unknown argument: ${argument}`)
    }

    const value = inlineValue ?? argv[index + 1]

    if (!value) {
      throw new Error(`Missing value for ${name}.`)
    }

    if (inlineValue === undefined) {
      index += 1
    }

    apply(value)
  }

  return options
}

function printHelp() {
  process.stdout.write(`Usage: npm run deploy:prod -- [options]

Deploys the current commit, which must be clean and equal to origin/main.

Options:
  --host <value>        SSH host (required; or DEPLOY_SSH_HOST)
  --port <value>        SSH port, default 22 (or DEPLOY_SSH_PORT)
  --repo-path <path>    Server checkout path (required; or DEPLOY_REPO_PATH)
  --compose-file <path> Repeatable Compose file; defaults to compose.yml, plus compose.prod.yml when present on the server
  --skip-validate       Skip the local npm run validate gate
  --dry-run             Check the local tree, then print the plan without validating or deploying
  --help                Show this message
`)
}

/**
 * Split a comma-separated list of Compose files.
 * @param {string | undefined} value Raw DEPLOY_COMPOSE_FILES value.
 * @returns {string[]} The non-empty entries.
 */
function parseComposeFiles(value) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    ?? []
}

function shellQuote(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`
}

/**
 * Run a command and exit with its status when it fails.
 * @param {string} command Executable to run.
 * @param {string[]} args Its arguments.
 * @param {{ captureOutput?: boolean }} [options] Capture stdout instead of inheriting it.
 * @returns {string} Trimmed stdout when captured, otherwise an empty string.
 */
function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit'
  })

  if (result.error) {
    throw result.error
  }

  if ((result.status ?? 1) !== 0) {
    if (options.captureOutput && result.stderr?.trim()) {
      process.stderr.write(`${result.stderr.trim()}\n`)
    }

    process.exit(result.status ?? 1)
  }

  return result.stdout?.trim() ?? ''
}

/**
 * Refuse to deploy anything but a clean, pushed commit on main.
 * Fetches origin/main first so the comparison is against the remote, not a stale ref.
 */
function requireCleanPushedMain() {
  if (runCommand('git', ['status', '--porcelain'], { captureOutput: true })) {
    throw new Error('Refusing to deploy: the local tree has uncommitted changes. Commit or stash them first.')
  }

  runCommand('git', ['fetch', 'origin', deployBranch])

  const localHead = runCommand('git', ['rev-parse', 'HEAD'], { captureOutput: true })
  const remoteHead = runCommand('git', ['rev-parse', `origin/${deployBranch}`], { captureOutput: true })

  if (localHead !== remoteHead) {
    throw new Error(`Refusing to deploy: HEAD (${localHead.slice(0, 8)}) is not origin/${deployBranch} (${remoteHead.slice(0, 8)}). Push to ${deployBranch} first.`)
  }
}

/**
 * Build the shell script run on the server.
 * @param {{ composeFiles: string[], repoPath: string }} options
 * @returns {string} A bash script that refuses a dirty checkout, updates it and rebuilds the stack.
 */
function buildRemoteDeployCommand(options) {
  const branch = shellQuote(deployBranch)
  const repoPath = shellQuote(options.repoPath)
  const composeFileCommands = options.composeFiles.length > 0
    ? options.composeFiles.map((composeFile) => `compose_args+=("-f" ${shellQuote(composeFile)})`)
    : [
        'compose_args+=("-f" "compose.yml")',
        'if [[ -f compose.prod.yml ]]; then',
        '  compose_args+=("-f" "compose.prod.yml")',
        'fi'
      ]

  return [
    'set -euo pipefail',
    `cd ${repoPath}`,
    'compose_args=()',
    ...composeFileCommands,
    'git rev-parse --is-inside-work-tree >/dev/null',
    'if [[ -n "$(git status --short --untracked-files=no)" ]]; then',
    '  printf "%s\n" "Refusing to deploy: remote repository has tracked changes." >&2',
    '  git status --short --untracked-files=no >&2',
    '  exit 1',
    'fi',
    `git fetch origin ${branch}`,
    `git checkout ${branch}`,
    `git pull --ff-only origin ${branch}`,
    'docker compose "${compose_args[@]}" up --build -d',
    'docker compose "${compose_args[@]}" ps',
    'printf "%s %s\n" "Deployed commit:" "$(git rev-parse --short HEAD)"'
  ].join('\n')
}

function describeComposeFiles(options) {
  if (options.composeFiles.length > 0) {
    return options.composeFiles.join(', ')
  }

  return 'compose.yml, plus compose.prod.yml when present on the server'
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  // Phase 1: refusals that need nothing but the local checkout.
  if (!options.host) {
    throw new Error('Set DEPLOY_SSH_HOST (or pass --host) to the SSH host to deploy to.')
  }

  if (!options.repoPath) {
    throw new Error('Set DEPLOY_REPO_PATH (or pass --repo-path) to the checkout path on the server.')
  }

  requireCleanPushedMain()

  const remoteShellCommand = `bash -lc ${shellQuote(buildRemoteDeployCommand(options))}`
  const sshArgs = ['-p', options.port, options.host, remoteShellCommand]

  if (options.dryRun) {
    process.stdout.write(`Local repo: ${repoRoot}\n`)
    process.stdout.write(`Commit: ${runCommand('git', ['rev-parse', '--short', 'HEAD'], { captureOutput: true })} (origin/${deployBranch})\n`)
    process.stdout.write(`Remote host: ${options.host}:${options.port}\n`)
    process.stdout.write(`Remote repo: ${options.repoPath}\n`)
    process.stdout.write(`Compose files: ${describeComposeFiles(options)}\n`)
    process.stdout.write(`Will validate first: ${options.skipValidate ? 'no' : 'yes'}\n`)
    process.stdout.write(`SSH command: ssh ${sshArgs.map(shellQuote).join(' ')}\n`)
    return
  }

  // Phase 2: the gate, then the server.
  if (!options.skipValidate) {
    runCommand('npm', ['run', 'validate'])
  }

  runCommand('ssh', sshArgs)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
