import { emitEmpty, emitPostToolContext, extractFilePaths, getToolName, isFileEditingTool, parseHookInput, readStdin, runWorkspaceCommand, summarizeOutput } from './hook-utils.mjs'

const rawInput = await readStdin()
const event = parseHookInput(rawInput)

if (!isFileEditingTool(getToolName(event))) {
  emitEmpty()
  process.exit(0)
}

const filePaths = extractFilePaths(event)
if (filePaths.length === 0) {
  emitEmpty()
  process.exit(0)
}

const hasPathPrefix = (prefix) => filePaths.some((filePath) => filePath === prefix || filePath.startsWith(`${prefix}/`))

const areaFlags = {
  prisma: hasPathPrefix('apps/api/prisma'),
  api: hasPathPrefix('apps/api/src'),
  web: hasPathPrefix('apps/web/src'),
  shared: hasPathPrefix('packages/shared/src'),
  rootConfig: filePaths.some((filePath) => ['package.json', 'eslint.config.mjs', 'tsconfig.base.json'].includes(filePath))
}

const activeAreas = Object.entries(areaFlags)
  .filter(([, enabled]) => enabled)
  .map(([area]) => area)

if (activeAreas.length === 0) {
  emitEmpty()
  process.exit(0)
}

const suggestions = []
if (areaFlags.shared) {
  suggestions.push('npm run typecheck --workspace @game-is-up/shared')
}
if (areaFlags.api) {
  suggestions.push('npm run typecheck --workspace @game-is-up/api')
}
if (areaFlags.prisma) {
  suggestions.push('npm run prisma:validate --workspace @game-is-up/api')
}
if (areaFlags.web) {
  suggestions.push('npm run typecheck --workspace @game-is-up/web')
}
if (areaFlags.rootConfig) {
  suggestions.push('npm run validate')
}
let commandLabel = null
let commandArgs = null

if (areaFlags.prisma && activeAreas.length === 1) {
  commandLabel = 'npm run prisma:validate --workspace @game-is-up/api'
  commandArgs = ['run', 'prisma:validate', '--workspace', '@game-is-up/api']
} else if (areaFlags.api && activeAreas.length === 1) {
  commandLabel = 'npm run typecheck --workspace @game-is-up/api'
  commandArgs = ['run', 'typecheck', '--workspace', '@game-is-up/api']
} else if (areaFlags.web && activeAreas.length === 1) {
  commandLabel = 'npm run typecheck --workspace @game-is-up/web'
  commandArgs = ['run', 'typecheck', '--workspace', '@game-is-up/web']
} else if (areaFlags.shared && activeAreas.length === 1) {
  commandLabel = 'npm run typecheck --workspace @game-is-up/shared'
  commandArgs = ['run', 'typecheck', '--workspace', '@game-is-up/shared']
} else if (areaFlags.rootConfig && activeAreas.length === 1) {
  commandLabel = 'npm run validate'
  commandArgs = ['run', 'validate']
}

if (!commandLabel || !commandArgs) {
  emitPostToolContext(
    `Validation suggestion: changes span ${activeAreas.join(', ')}. Prefer targeted checks first (${suggestions.join(', ')}) and run npm run validate before finishing.`
  )
  process.exit(0)
}

const result = runWorkspaceCommand('npm', commandArgs)
if (result.status === 0) {
  emitPostToolContext(`Targeted validation passed: ${commandLabel}. Run npm run validate before finishing the overall task.`)
  process.exit(0)
}

const output = summarizeOutput(`${result.stdout}\n${result.stderr}`)
emitPostToolContext(`Targeted validation failed: ${commandLabel}. ${output || 'Review the command output and fix the relevant issue before continuing.'}`)
