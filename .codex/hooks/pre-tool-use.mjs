import { emitEmpty, emitPreToolDeny, getToolInput, parseHookInput, readStdin } from './hook-utils.mjs'

const input = await readStdin()
const event = parseHookInput(input)
const toolInput = getToolInput(event)
const command = typeof toolInput.command === 'string' ? toolInput.command : ''
const lowerCommand = command.toLowerCase()

const blockedPatterns = [
  `git reset ${'--hard'}`,
  `git checkout ${'--'}`,
  `rm -rf ${'/'}`,
  `sudo ${'rm -rf'}`,
  `find . ${'-delete'}`
]

const blockedPattern = blockedPatterns.find((pattern) => lowerCommand.includes(pattern))

if (blockedPattern) {
  emitPreToolDeny(`Blocked dangerous command pattern: ${blockedPattern}`)
  process.exit(0)
}

emitEmpty()
