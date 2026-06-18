import { emitPreToolAllow, emitPreToolDeny, normalizeToolName, parseHookInput, readStdin } from './hook-utils.mjs'

const input = await readStdin()
const lowerInput = input.toLowerCase()
const event = parseHookInput(input)
const toolName = normalizeToolName(event.tool_name)
const command = typeof event.tool_input?.command === 'string' ? event.tool_input.command : ''

const blockedPatterns = [
  `git reset ${'--hard'}`,
  `git checkout ${'--'}`,
  `rm -rf ${'/'}`,
  `sudo ${'rm -rf'}`,
  `find . ${'-delete'}`
]

const blockedPattern = blockedPatterns.find((pattern) => lowerInput.includes(pattern))

if (blockedPattern) {
  emitPreToolDeny(`Blocked dangerous command pattern: ${blockedPattern}`)
  process.exit(0)
}

if (toolName === 'Bash' && /(^|\s)git\s+commit(\s|$)/.test(command)) {
  emitPreToolAllow('Commit command allowed. Review docs first or use the /commit command, and remember to run validation before committing.')
  process.exit(0)
}

if (toolName === 'Bash' && /(^|\s)git\s+push(\s|$)/.test(command)) {
  emitPreToolAllow('Push command allowed. Push only after explicit user confirmation and after the commit workflow is complete.')
  process.exit(0)
}

emitPreToolAllow('No blocked command pattern detected.')
