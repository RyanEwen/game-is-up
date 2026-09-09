import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { emitSessionMessage, readStdin, workspaceRoot } from './hook-utils.mjs'

await readStdin()

function readCommand(command) {
  try {
    return execSync(command, { cwd: workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}

function countFiles(relativePath, suffix) {
  try {
    return readdirSync(path.join(workspaceRoot, relativePath)).filter((entry) => entry.endsWith(suffix)).length
  } catch {
    return 0
  }
}

const branch = readCommand('git rev-parse --abbrev-ref HEAD')
const worktreeState = readCommand('git status --porcelain') ? 'dirty' : 'clean'
const nodeVersion = process.version
const instructionCount = ['AGENTS.md', 'apps/web/AGENTS.md', 'apps/api/AGENTS.md', 'apps/api/prisma/AGENTS.md'].filter((filePath) =>
  existsSync(path.join(workspaceRoot, filePath))
).length
const skillCount = countFiles('.agents/skills', '')
const hookCount = countFiles('.codex/hooks', '.mjs') - 1

emitSessionMessage(
  `Project context: branch=${branch}, worktree=${worktreeState}, Node=${nodeVersion}, instructions=${instructionCount}, skills=${skillCount}, hooks=${hookCount}. Core rules: treat the app as web-first, keep contracts in packages/shared, and keep discovery friends-first. Validation routing: shared -> npm run typecheck --workspace @game-is-up/shared. api -> npm run typecheck --workspace @game-is-up/api. prisma -> npm run prisma:validate --workspace @game-is-up/api. web -> npm run typecheck --workspace @game-is-up/web. finish -> npm run validate.`
)
