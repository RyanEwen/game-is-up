import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')

function parseArgs(argv) {
  const options = {
    branch: process.env.DEPLOY_GIT_BRANCH?.trim() || 'main',
    composeFiles: parseComposeFiles(process.env.DEPLOY_COMPOSE_FILES),
    dryRun: false,
    host: process.env.DEPLOY_SSH_HOST?.trim() || 'deploy@server.example',
    port: process.env.DEPLOY_SSH_PORT?.trim() || '22',
    push: false,
    repoPath: process.env.DEPLOY_REPO_PATH?.trim() || '/srv/game-is-up',
    skipCachePurge: false,
    skipValidate: false,
    sshKeyPath: process.env.DEPLOY_SSH_KEY?.trim() || undefined
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help') {
      printHelp()
      process.exit(0)
    }

    if (argument === '--push') {
      options.push = true
      continue
    }

    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (argument === '--skip-validate') {
      options.skipValidate = true
      continue
    }

    if (argument === '--skip-cache-purge') {
      options.skipCachePurge = true
      continue
    }

    if (argument === '--host') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --host.')
      }

      options.host = value
      index += 1
      continue
    }

    if (argument.startsWith('--host=')) {
      options.host = argument.slice('--host='.length)
      continue
    }

    if (argument === '--port') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --port.')
      }

      options.port = value
      index += 1
      continue
    }

    if (argument.startsWith('--port=')) {
      options.port = argument.slice('--port='.length)
      continue
    }

    if (argument === '--repo-path') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --repo-path.')
      }

      options.repoPath = value
      index += 1
      continue
    }

    if (argument.startsWith('--repo-path=')) {
      options.repoPath = argument.slice('--repo-path='.length)
      continue
    }

    if (argument === '--branch') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --branch.')
      }

      options.branch = value
      index += 1
      continue
    }

    if (argument.startsWith('--branch=')) {
      options.branch = argument.slice('--branch='.length)
      continue
    }

    if (argument === '--compose-file') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --compose-file.')
      }

      options.composeFiles.push(value)
      index += 1
      continue
    }

    if (argument.startsWith('--compose-file=')) {
      options.composeFiles.push(argument.slice('--compose-file='.length))
      continue
    }

    if (argument === '--ssh-key') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --ssh-key.')
      }

      options.sshKeyPath = value
      index += 1
      continue
    }

    if (argument.startsWith('--ssh-key=')) {
      options.sshKeyPath = argument.slice('--ssh-key='.length)
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

function printHelp() {
  process.stdout.write(`Usage: npm run deploy:prod:ssh -- [options]\n\nOptions:\n  --push                Push local HEAD to origin/<branch> before deploying\n  --skip-validate       Skip local npm run validate before deployment\n  --skip-cache-purge    Skip the post-deploy Cloudflare cache purge\n  --host <value>        SSH host, default deploy@server.example\n  --port <value>        SSH port, default 22\n  --repo-path <path>    Remote repo path, default /srv/game-is-up\n  --branch <name>       Git branch to deploy, default main\n  --compose-file <path> Repeatable Docker Compose file override; defaults to compose.yml and auto-adds compose.prod.yml when present on the server\n  --ssh-key <path>      SSH private key to use for the connection\n  --dry-run             Print the planned commands without running them\n  --help                Show this message\n`)
}

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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit'
  })

  if (result.error) {
    throw result.error
  }

  if ((result.status ?? 1) !== 0) {
    if (options.captureOutput) {
      const stderr = result.stderr?.trim()
      if (stderr) {
        process.stderr.write(`${stderr}\n`)
      }
    }

    process.exit(result.status ?? 1)
  }

  return result.stdout?.trim() ?? ''
}

function getLocalHead(ref) {
  return runCommand('git', ['rev-parse', ref], { captureOutput: true })
}

function getLocalStatus() {
  return runCommand('git', ['status', '--short'], { captureOutput: true })
}

function buildRemoteDeployCommand(options) {
  const branch = shellQuote(options.branch)
  const repoPath = shellQuote(options.repoPath)
  const shouldPurgeCache = !options.skipCachePurge
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
    ...(shouldPurgeCache
      ? [
          'if [[ -f .env ]] && grep -Eq "^(export[[:space:]]+)?CLOUDFLARE_API_TOKEN=" .env && grep -Eq "^(export[[:space:]]+)?CLOUDFLARE_ZONE_ID=" .env && grep -Eq "^(export[[:space:]]+)?(CLOUDFLARE_PURGE_BASE_URL|VITE_PUBLIC_APP_URL|CLIENT_ORIGIN)=" .env; then',
          '  npm run cache:purge:cloudflare',
          'else',
          '  printf "%s\n" "Skipping Cloudflare cache purge because the required values were not found in .env."',
          'fi'
        ]
      : []),
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
  const remoteDeployCommand = buildRemoteDeployCommand(options)
  const remoteShellCommand = `bash -lc ${shellQuote(remoteDeployCommand)}`
  const sshArgs = ['-p', options.port]

  if (options.sshKeyPath) {
    sshArgs.push('-i', options.sshKeyPath)
  }

  sshArgs.push(options.host, remoteShellCommand)

  if (options.dryRun) {
    process.stdout.write(`Local repo: ${repoRoot}\n`)
    process.stdout.write(`Remote host: ${options.host}:${options.port}\n`)
    process.stdout.write(`Remote repo: ${options.repoPath}\n`)
    process.stdout.write(`Branch: ${options.branch}\n`)
    process.stdout.write(`Compose files: ${describeComposeFiles(options)}\n`)
    process.stdout.write(`Will push first: ${options.push ? 'yes' : 'no'}\n`)
    process.stdout.write(`Will validate first: ${options.skipValidate ? 'no' : 'yes'}\n`)
    process.stdout.write(`Will purge Cloudflare cache: ${options.skipCachePurge ? 'no' : 'yes, when configured on the server'}\n`)
    process.stdout.write(`SSH command: ssh ${sshArgs.map(shellQuote).join(' ')}\n`)
    return
  }

  if (!options.skipValidate) {
    runCommand('npm', ['run', 'validate'])
  }

  runCommand('git', ['fetch', 'origin', options.branch])

  if (options.push) {
    const workingTreeStatus = getLocalStatus()

    if (workingTreeStatus) {
      throw new Error('Refusing to push before deploy: local repository has uncommitted changes.')
    }

    runCommand('git', ['push', 'origin', `HEAD:${options.branch}`])
    runCommand('git', ['fetch', 'origin', options.branch])
  }

  const localHead = getLocalHead('HEAD')
  const remoteTrackedHead = getLocalHead(`origin/${options.branch}`)

  if (localHead !== remoteTrackedHead) {
    throw new Error(`Local HEAD does not match origin/${options.branch}. Push first or rerun with --push.`)
  }

  runCommand('ssh', sshArgs, { cwd: process.cwd() })
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}