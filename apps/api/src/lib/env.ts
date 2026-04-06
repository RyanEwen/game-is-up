import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { serverEnvSchema } from '@game-is-up/shared'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRootEnvPath = resolve(currentDir, '../../../../.env')

loadEnv({ path: repoRootEnvPath })
loadEnv()

const parsed = serverEnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid server environment', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = {
  ...parsed.data
}