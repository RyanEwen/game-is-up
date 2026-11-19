/**
 * The API's one logger (LOG-3). Route, service and bot code log through `logger`, never through
 * `console` directly; lint enforces that outside this file.
 *
 * Each line is `[level] message {json}` on standard output (errors on standard error), where the
 * JSON holds the caller's fields plus the request correlation id when the line was written during
 * a request (`request-context.ts`). Docker adds the timestamp.
 *
 * What must not be logged (LOG-6): an `Error` anywhere in the fields is reduced to its name,
 * message, stack, code and cause. Library errors (discord.js, Prisma) carry request URLs, bodies
 * and query metadata on other properties, and interaction URLs embed Discord tokens, so those
 * properties are dropped. Prisma's validation error repeats the failed query, values included, in
 * its message and stack, so for it only a fixed message and the stack frames are kept. Callers
 * log identifiers, never message text or other user content.
 *
 * This module imports nothing from `env.ts`, so the environment check can log through it.
 */
import { getRequestId } from './request-context.js'

type Level = 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

/** How deep a chain of `cause` errors is followed before it is cut off. */
const maxCauseDepth = 3

/**
 * Whether the error's message repeats a failed database query, argument values included.
 * Prisma's validation error does; it is matched by class name so this module imports nothing.
 */
function messageCarriesQuery(error: Error): boolean {
  return (
    error.name === 'PrismaClientValidationError' ||
    error.constructor?.name === 'PrismaClientValidationError'
  )
}

/** The `at ...` lines of a stack, without the message lines before them. */
function stackFramesOnly(stack: string): string {
  return stack
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .join('\n')
}

/**
 * The parts of an error that are safe to log. `code` is kept only when it is a string or number
 * (Node, Prisma and Discord error codes); `cause` is followed a few levels.
 */
function serializeError(error: Error, depth = 0): Record<string, unknown> {
  const code = (error as { code?: unknown }).code
  const hidesMessage = messageCarriesQuery(error)
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: hidesMessage ? 'invalid query arguments' : error.message,
  }

  if (typeof code === 'string' || typeof code === 'number') {
    serialized.code = code
  }
  if (error.stack) {
    // The stack starts with the message, so a hidden message keeps only the frames.
    serialized.stack = hidesMessage ? stackFramesOnly(error.stack) : error.stack
  }
  if (error.cause !== undefined && depth < maxCauseDepth) {
    serialized.cause =
      error.cause instanceof Error
        ? serializeError(error.cause, depth + 1)
        : String(error.cause)
  }

  return serialized
}

/**
 * Turn the fields into one JSON string: errors at any depth are reduced (see above), bigints
 * become strings and a repeated object is written once, so logging never throws.
 */
function stringifyFields(fields: LogFields): string {
  const seen = new WeakSet<object>()

  return JSON.stringify(fields, (_key, value: unknown) => {
    if (value instanceof Error) {
      return serializeError(value)
    }
    if (typeof value === 'bigint') {
      return value.toString()
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[repeated]'
      }
      seen.add(value)
    }
    return value
  })
}

/** Write one line at `level`, adding the request id when there is one. */
function emit(level: Level, message: string, fields: LogFields = {}): void {
  const requestId = getRequestId()
  const context = requestId ? { ...fields, requestId } : fields
  const line =
    Object.keys(context).length > 0
      ? `[${level}] ${message} ${stringifyFields(context)}`
      : `[${level}] ${message}`

  // Looked up on each call (not bound once) so tests can stub `console.error`.
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  warn: (message: string, fields?: LogFields) => emit('warn', message, fields),
  error: (message: string, fields?: LogFields) =>
    emit('error', message, fields),
}
