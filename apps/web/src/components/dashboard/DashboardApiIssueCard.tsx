import { buildApiIssueMessage } from './apiIssue'
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded'
import { EmptyState } from '../EmptyState'

export function DashboardApiIssueCard({
  error,
  title = "Game's Up is temporarily unavailable",
}: {
  error: string
  title?: string
}) {
  return (
    <EmptyState
      icon={<CloudOffRoundedIcon />}
      title={title}
      description={buildApiIssueMessage(error)}
    />
  )
}
