const debugPlayIntentResponsePrefix = 'debug-play-intent-response'

export function buildDebugPlayIntentResponseCustomId(playIntentId: string, response: 'join' | 'pass') {
  return `${debugPlayIntentResponsePrefix}:${playIntentId}:${response}`
}

export function parseDebugPlayIntentResponseCustomId(customId: string) {
  const parts = customId.split(':')

  if (parts.length !== 3 || parts[0] !== debugPlayIntentResponsePrefix || !parts[1]) {
    return null
  }

  if (parts[2] !== 'join' && parts[2] !== 'pass') {
    return null
  }

  return {
    playIntentId: parts[1],
    response: parts[2]
  }
}