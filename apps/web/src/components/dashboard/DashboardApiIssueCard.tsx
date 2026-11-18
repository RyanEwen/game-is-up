import { buildApiIssueMessage } from './apiIssue'
import { EmptyStateCard } from './EmptyStateCard'

export function DashboardApiIssueCard({
  error,
  title = "Game's Up is temporarily unavailable",
}: {
  error: string
  title?: string
}) {
  return <EmptyStateCard title={title} body={buildApiIssueMessage(error)} />
}
