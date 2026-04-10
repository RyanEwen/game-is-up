import net from 'node:net'

const defaultDatabaseUrl = 'postgresql://postgres:postgres@db:5432/game_is_up?schema=public'
const timeoutMs = Number.parseInt(process.env.DB_WAIT_TIMEOUT_MS ?? '60000', 10)
const retryDelayMs = Number.parseInt(process.env.DB_WAIT_RETRY_MS ?? '1000', 10)

function redactDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl)
    if (parsed.password) {
      parsed.password = '***'
    }
    return parsed.toString()
  } catch {
    return databaseUrl
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

function tryConnect(host, port) {
  return new Promise((resolveConnect) => {
    const socket = net.createConnection({ host, port })

    socket.setTimeout(2000)

    socket.once('connect', () => {
      socket.end()
      resolveConnect(true)
    })

    const fail = () => {
      socket.destroy()
      resolveConnect(false)
    }

    socket.once('timeout', fail)
    socket.once('error', fail)
  })
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl
  const parsed = new URL(databaseUrl)
  const port = parsed.port ? Number(parsed.port) : 5432
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    if (await tryConnect(parsed.hostname, port)) {
      console.log(`Database is reachable at ${redactDatabaseUrl(databaseUrl)}`)
      return
    }

    await delay(retryDelayMs)
  }

  console.error(`Timed out waiting for database at ${redactDatabaseUrl(databaseUrl)}`)
  process.exit(1)
}

main().catch((error) => {
  console.error('Failed to check database availability.', error)
  process.exit(1)
})