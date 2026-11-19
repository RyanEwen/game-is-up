/**
 * The app's About surface (BRAND-8): product name and version, the one-line description, then
 * the Links section, in that order and with the shared family labels. The web app updates
 * itself (`lib/webUpdate.ts`), so there is no "Check for updates", and a browser has no logs
 * folder, so there is no Diagnostics section.
 */
import { DialogTitle, Link, List, ListItem, Stack, Typography } from '@mui/joy'
import { productLinks } from '../../lib/productLinks'
import { readLocalWebBuildId } from '../../lib/webBuildId'
import { DashboardModal } from './DashboardModal'

/** Builds carry no release number yet (REL-4), so the version is the deployed build's id. */
function describeVersion(): string {
  const buildId = readLocalWebBuildId()
  return buildId ? `Version ${buildId.slice(0, 12)}` : 'Development build'
}

export function AboutDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const links = [
    { label: 'Source code', href: productLinks.sourceCode },
    { label: 'Privacy policy', href: productLinks.privacyPolicy },
    { label: 'Support', href: productLinks.support },
    { label: 'License', href: productLinks.license },
    { label: 'Third-party notices', href: productLinks.thirdPartyNotices },
  ].filter((link): link is { label: string; href: string } =>
    Boolean(link.href),
  )

  return (
    <DashboardModal open={open} onClose={onClose} width="420px">
      <Stack spacing={2}>
        <DialogTitle>About</DialogTitle>
        <Stack spacing={0.5}>
          <Typography level="title-lg">Game&apos;s Up</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            {describeVersion()}
          </Typography>
          <Typography level="body-sm">
            See which friends play the same games, and get a game going with
            them through Discord.
          </Typography>
        </Stack>
        <Stack spacing={0.5}>
          <Typography level="title-sm">Links</Typography>
          <List size="sm" sx={{ '--ListItem-paddingX': 0 }}>
            {links.map((link) => (
              <ListItem key={link.label}>
                <Link href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </Link>
              </ListItem>
            ))}
          </List>
        </Stack>
      </Stack>
    </DashboardModal>
  )
}
