/**
 * Prisma CLI configuration (Prisma 7): where the schema, migrations and seed live, and which
 * database the CLI uses. Prisma 7 no longer reads `.env` itself; the npm scripts and the
 * container pass DATABASE_URL. Without one, a placeholder lets `prisma generate` and
 * `prisma validate` run (the Docker build and `npm run validate` have no database); commands that
 * need a database fail against it.
 */
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://validate_only@localhost:5432/validate_only',
  },
})
