import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const defaultEnvFilePath = path.join(repoRoot, '.env')
const defaultPaths = ['/', '/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest']

function parseArgs(argv) {
  const options = {
    baseUrl: undefined,
    dryRun: false,
    envFilePath: defaultEnvFilePath,
    everything: false,
    paths: []
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help') {
      printHelp()
      process.exit(0)
    }

    if (argument === '--everything') {
      options.everything = true
      continue
    }

    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (argument === '--env-file') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --env-file.')
      }

      options.envFilePath = path.resolve(process.cwd(), value)
      index += 1
      continue
    }

    if (argument.startsWith('--env-file=')) {
      options.envFilePath = path.resolve(process.cwd(), argument.slice('--env-file='.length))
      continue
    }

    if (argument === '--base-url') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --base-url.')
      }

      options.baseUrl = value
      index += 1
      continue
    }

    if (argument.startsWith('--base-url=')) {
      options.baseUrl = argument.slice('--base-url='.length)
      continue
    }

    if (argument === '--path') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Missing value for --path.')
      }

      options.paths.push(value)
      index += 1
      continue
    }

    if (argument.startsWith('--path=')) {
      options.paths.push(argument.slice('--path='.length))
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

function printHelp() {
  process.stdout.write(`Usage: npm run cache:purge:cloudflare -- [options]\n\nOptions:\n  --everything           Purge the entire Cloudflare zone cache\n  --path <value>         Add an extra path or absolute URL to purge\n  --base-url <url>       Override the public app base URL\n  --env-file <path>      Load environment variables from a specific file\n  --dry-run              Print the request payload without calling Cloudflare\n  --help                 Show this message\n`)
}

function loadEnvFile(envFilePath) {
  if (!envFilePath || !fs.existsSync(envFilePath)) {
    return false
  }

  const contents = fs.readFileSync(envFilePath, 'utf8')

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length) : line
    const separatorIndex = withoutExport.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = withoutExport.slice(0, separatorIndex).trim()
    const rawValue = withoutExport.slice(separatorIndex + 1).trim()

    if (!key || process.env[key] !== undefined) {
      continue
    }

    process.env[key] = parseEnvValue(rawValue)
  }

  return true
}

function parseEnvValue(rawValue) {
  if (!rawValue) {
    return ''
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1).replace(/\\n/g, '\n')
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1)
  }

  return rawValue
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/iu.test(value ?? '')
}

function parseList(value) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function pickFirstPopulatedValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value)
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/$/u, '') || '/'
  return parsed
}

function buildAbsoluteUrl(baseUrl, target) {
  if (/^https?:\/\//iu.test(target)) {
    return new URL(target).toString()
  }

  const base = normalizeBaseUrl(baseUrl)
  const prefix = base.pathname === '/' ? '' : base.pathname
  const normalizedTarget = target.startsWith('/') ? target : `/${target}`
  const builtUrl = new URL(base.origin)
  builtUrl.pathname = `${prefix}${normalizedTarget}`.replace(/\/+/gu, '/')
  return builtUrl.toString()
}

function unique(values) {
  return [...new Set(values)]
}

function formatErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Unknown Cloudflare API error.'
  }

  return errors
    .map((error) => {
      if (!error || typeof error !== 'object') {
        return String(error)
      }

      const code = 'code' in error ? String(error.code) : 'unknown'
      const message = 'message' in error ? String(error.message) : JSON.stringify(error)
      return `${code}: ${message}`
    })
    .join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const loadedEnvFile = loadEnvFile(options.envFilePath)
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const zoneId = process.env.CLOUDFLARE_ZONE_ID
  const purgeEverything = options.everything || parseBoolean(process.env.CLOUDFLARE_PURGE_EVERYTHING)
  const baseUrl = pickFirstPopulatedValue(
    options.baseUrl,
    process.env.CLOUDFLARE_PURGE_BASE_URL,
    process.env.VITE_PUBLIC_APP_URL,
    process.env.CLIENT_ORIGIN
  )

  if (!apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN is required.')
  }

  if (!zoneId) {
    throw new Error('CLOUDFLARE_ZONE_ID is required.')
  }

  if (!purgeEverything && !baseUrl) {
    throw new Error('Set CLOUDFLARE_PURGE_BASE_URL, VITE_PUBLIC_APP_URL, or CLIENT_ORIGIN, or pass --base-url.')
  }

  const files = purgeEverything
    ? undefined
    : unique(
        [...defaultPaths, ...parseList(process.env.CLOUDFLARE_PURGE_PATHS), ...options.paths]
          .map((target) => buildAbsoluteUrl(baseUrl, target))
      )

  const payload = purgeEverything ? { purge_everything: true } : { files }

  if (loadedEnvFile) {
    process.stdout.write(`Loaded environment from ${path.relative(repoRoot, options.envFilePath) || '.env'}.\n`)
  }

  if (purgeEverything) {
    process.stdout.write('Purging the entire Cloudflare zone cache.\n')
  } else {
    process.stdout.write(`Purging ${files.length} Cloudflare cache URLs.\n`)
    for (const file of files) {
      process.stdout.write(`- ${file}\n`)
    }
  }

  if (options.dryRun) {
    process.stdout.write('Dry run complete. No request sent.\n')
    return
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const responseBody = await response.json().catch(() => null)

  if (!response.ok || !responseBody?.success) {
    throw new Error(formatErrors(responseBody?.errors))
  }

  process.stdout.write('Cloudflare cache purge accepted.\n')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})