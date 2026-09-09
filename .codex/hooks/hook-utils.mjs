import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

function resolveWorkspaceRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })

  return result.status === 0 ? result.stdout.trim() : process.cwd()
}

export const workspaceRoot = resolveWorkspaceRoot()

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
  return (String(toolName).split('.').pop() ?? '').trim()
}

export function isFileEditingTool(toolName) {
  return normalizeToolName(toolName) === 'apply_patch'
}

export function getToolName(event) {
  return normalizeToolName(event.tool_name)
}

export function getToolInput(event) {
  return event.tool_input ?? {}
}

function normalizeFilePath(filePath) {
  if (typeof filePath !== 'string') {
    return null
  }

  const trimmedPath = filePath.trim()
  if (!trimmedPath) {
    return null
  }

  if (path.isAbsolute(trimmedPath)) {
    const relativePath = path.relative(workspaceRoot, trimmedPath)
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      return relativePath || null
    }
  }

  return trimmedPath.replace(/^\.\//, '')
}

export function extractFilePaths(event) {
  const toolName = getToolName(event)
  const toolInput = getToolInput(event)
  const filePaths = new Set()

  const addPath = (filePath) => {
    const normalizedPath = normalizeFilePath(filePath)
    if (normalizedPath) {
      filePaths.add(normalizedPath)
    }
  }

  addPath(toolInput.file_path)
  addPath(toolInput.notebook_path)
  addPath(toolInput.path)

  if (Array.isArray(toolInput.file_paths)) {
    toolInput.file_paths.forEach(addPath)
  }

  if (toolName === 'apply_patch') {
    const patch = String(toolInput.command ?? '')
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
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: message
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
