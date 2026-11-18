import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const prismaBinary = path.join(repoRoot, 'node_modules', '.bin', 'prisma')
const schemaPath = path.join(repoRoot, 'apps', 'api', 'prisma', 'schema.prisma')
const apiCwd = path.join(repoRoot, 'apps', 'api')
const baselineMigrationName = '20260411120000_baseline'

function runPrisma(args, stdio = 'pipe') {
  return execFileSync(prismaBinary, args, {
    cwd: apiCwd,
    env: process.env,
    encoding: 'utf8',
    stdio,
  })
}

const prisma = new PrismaClient()

async function main() {
  const migrationTableResult = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) AS exists`,
  )
  const appTableCountResult = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'`,
  )

  const migrationTableExists = Boolean(migrationTableResult[0]?.exists)
  const appTableCount = Number(appTableCountResult[0]?.count ?? 0)

  if (!migrationTableExists && appTableCount > 0) {
    process.stdout.write(
      `Existing database detected. Marking ${baselineMigrationName} as applied before deploy.\n`,
    )
    runPrisma(
      [
        'migrate',
        'resolve',
        '--applied',
        baselineMigrationName,
        '--schema',
        schemaPath,
      ],
      'inherit',
    )
  }

  process.stdout.write('Applying pending Prisma migrations.\n')
  runPrisma(['migrate', 'deploy', '--schema', schemaPath], 'inherit')
}

main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
