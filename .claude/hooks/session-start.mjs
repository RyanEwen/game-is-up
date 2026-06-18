import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { emitSessionMessage, workspaceRoot } from './hook-utils.mjs'

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

function countInstructionFiles() {
  // One root CLAUDE.md plus the nested area-specific ones.
  return ['CLAUDE.md', 'apps/web/CLAUDE.md', 'apps/api/CLAUDE.md', 'apps/api/prisma/CLAUDE.md'].filter((relativePath) =>
    existsSync(path.join(workspaceRoot, relativePath))
  ).length
}

const branch = readCommand('git rev-parse --abbrev-ref HEAD')
const worktreeState = readCommand('git status --porcelain') ? 'dirty' : 'clean'
const nodeVersion = readCommand('node --version')
const npmVersion = readCommand('npm --version')
const instructionCount = countInstructionFiles()
const commandCount = countFiles('.claude/commands', '.md')
const hookCount = countFiles('.claude/hooks', '.mjs') - 1 // exclude shared hook-utils.mjs

emitSessionMessage(
  `Project context: branch=${branch}, worktree=${worktreeState}, Node=${nodeVersion}, npm=${npmVersion}, instructions=${instructionCount}, commands=${commandCount}, hooks=${hookCount}. Core rules: treat the app as web-first, keep contracts in packages/shared, and keep discovery friends-first. Validation routing: shared -> npm run typecheck --workspace @game-is-up/shared. api -> npm run typecheck --workspace @game-is-up/api. prisma -> npm run prisma:validate --workspace @game-is-up/api. web -> npm run typecheck --workspace @game-is-up/web. finish -> npm run validate.`
)
