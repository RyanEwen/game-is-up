import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

export const workspaceRoot = '/workspace/game-is-up'

export function readStdin() {
  return new Promise((resolve) => {
    let input = ''

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      input += chunk
    })
    process.stdin.on('end', () => {
      resolve(input)
    })
  })
}

export function parseHookInput(rawInput) {
  try {
    return JSON.parse(rawInput)
  } catch {
    return {}
  }
}

export function normalizeToolName(toolName = '') {
  return String(toolName).split('.').pop() ?? ''
}

export function isFileEditingTool(toolName) {
  return new Set(['apply_patch', 'create_file', 'edit_notebook_file']).has(normalizeToolName(toolName))
}

function normalizeFilePath(filePath) {
  if (typeof filePath !== 'string') {
    return null
  }

  const trimmedPath = filePath.trim()
  if (!trimmedPath) {
    return null
  }

  if (trimmedPath.startsWith(workspaceRoot)) {
    const relativePath = path.relative(workspaceRoot, trimmedPath)
    return relativePath || null
  }

  return trimmedPath.replace(/^\.\//, '')
}

export function extractFilePaths(event) {
  const toolName = normalizeToolName(event.toolName)
  const toolInput = event.toolInput ?? {}
  const filePaths = new Set()

  const addPath = (filePath) => {
    const normalizedPath = normalizeFilePath(filePath)
    if (normalizedPath) {
      filePaths.add(normalizedPath)
    }
  }

  addPath(toolInput.filePath)
  addPath(toolInput.path)

  if (Array.isArray(toolInput.filePaths)) {
    toolInput.filePaths.forEach(addPath)
  }

  if (toolName === 'apply_patch') {
    const patch = String(toolInput.input ?? '')
    for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
      addPath(match[1].split(' -> ')[0])
    }
  }

  return [...filePaths]
}

export function runWorkspaceCommand(command, args, timeout = 120000) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: process.env,
    timeout
  })

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

export function summarizeOutput(output, maxLines = 8) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines)
    .join(' | ')
}

export function emitEmpty() {
  process.stdout.write('{}')
}

export function emitPostToolContext(message) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: message
      }
    })
  )
}

export function emitSessionMessage(message) {
  process.stdout.write(
    JSON.stringify({
      continue: true,
      systemMessage: message
    })
  )
}

export function emitPreToolAllow(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: reason
      }
    })
  )
}

export function emitPreToolDeny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      }
    })
  )
}