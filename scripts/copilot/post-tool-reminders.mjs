import { emitEmpty, emitPostToolContext, extractFilePaths, isFileEditingTool, parseHookInput, readStdin } from './hook-utils.mjs'

const rawInput = await readStdin()
const event = parseHookInput(rawInput)

if (!isFileEditingTool(event.toolName)) {
  emitEmpty()
  process.exit(0)
}

const filePaths = extractFilePaths(event)
if (filePaths.length === 0) {
  emitEmpty()
  process.exit(0)
}

const reminders = []

if (filePaths.some((filePath) => filePath.startsWith('packages/shared/'))) {
  reminders.push('Shared contracts changed. Keep API and web request and response shapes synchronized through packages/shared.')
}

if (
  filePaths.some(
    (filePath) =>
      filePath.startsWith('apps/api/src/routes/') ||
      filePath.startsWith('apps/api/src/lib/') ||
      filePath === 'apps/api/src/app.ts' ||
      filePath === 'apps/api/src/index.ts'
  )
) {
  reminders.push('API changes should validate external input at the boundary, keep route handlers thin, and use shared Zod schemas when the contract is shared.')
}

if (filePaths.some((filePath) => filePath.startsWith('apps/web/src/'))) {
  reminders.push('Web changes should preserve the current Joy UI direction, keep UI state simple, and avoid browser-only assumptions in core flows.')
}

if (filePaths.some((filePath) => filePath.startsWith('apps/api/prisma/'))) {
  reminders.push('Prisma changes should keep shared contracts, demo data, and placeholder behavior aligned. Regenerate or validate Prisma artifacts when appropriate.')
}

if (reminders.length === 0) {
  emitEmpty()
  process.exit(0)
}

emitPostToolContext(`REMINDERS: ${reminders.join(' ')}`)