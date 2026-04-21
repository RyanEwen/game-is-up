const apiIssueRecoveryMessage = 'Retrying in the background every 5 seconds. The dashboard will refresh automatically when the API responds again.'

function ensureSentence(message: string) {
  return /[.!?]$/.test(message) ? message : `${message}.`
}

export function formatApiIssueSummary(error: string) {
  const trimmed = error.trim()

  if (!trimmed) {
    return "Game's Up cannot reach the API right now."
  }

  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(trimmed)) {
    return "Game's Up cannot reach the API right now."
  }

  if (/unexpected end of json input|json|parse/i.test(trimmed)) {
    return "Game's Up received an invalid response from the API."
  }

  return ensureSentence(trimmed)
}

export function buildApiIssueMessage(error: string) {
  return `${formatApiIssueSummary(error)} ${apiIssueRecoveryMessage}`
}