/**
 * The public privacy policy at /privacy (BRAND-8, BRAND-9). It is routed outside the dashboard,
 * so it loads without signing in, and it is linked from the footer, the About dialog and
 * .github/SECURITY.md.
 *
 * Keep it factually in step with what the app stores and sends: the data inventory in
 * docs/deployment.md ("Data and privacy"), the Prisma schema, the Discord sign-in scopes
 * (apps/api/src/lib/discord-auth.ts) and the analytics sanitiser (apps/web/src/lib/analytics.ts).
 * Wording changes are approved by the maintainer.
 */
// React in scope: the root test runner compiles .tsx with the classic JSX transform.
import React, { useEffect, type ReactNode } from 'react'
import {
  CssBaseline,
  Link,
  List,
  ListItem,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy'
import { CssVarsProvider } from '@mui/joy/styles'
import { useChromeCssVars } from '../hooks/useChromeCssVars'
import { appThemeVariants, DEFAULT_APP_THEME } from '../theme/themes'

/** The contact for privacy questions and deletion requests (the company address, D-017). */
const contactEmail = 'contact@dynamic-solutions.ca'
const lastUpdated = '19 November 2026'

/** One titled section of the policy. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack component="section" spacing={1}>
      <Typography level="h3">{title}</Typography>
      {children}
    </Stack>
  )
}

/** A paragraph that opens with a bold label, as the "What we collect" items do. */
function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Typography level="body-md">
      <strong>{label}</strong> {children}
    </Typography>
  )
}

const contactLink = <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>

export function PrivacyPage() {
  // A public page always renders in the app's default theme, like the invite landing page.
  useChromeCssVars(appThemeVariants[DEFAULT_APP_THEME].chromeCssVars)

  useEffect(() => {
    document.title = "Game's Up • Privacy"
  }, [])

  return (
    <CssVarsProvider
      theme={appThemeVariants[DEFAULT_APP_THEME].theme}
      defaultMode="dark"
    >
      <CssBaseline />
      <Sheet
        component="main"
        variant="plain"
        sx={{
          maxWidth: 820,
          mx: 'auto',
          my: { xs: 3, md: 5 },
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4 },
          borderRadius: 'xl',
          border: '1px solid #272f3c',
        }}
      >
        <Stack spacing={3}>
          <Stack spacing={0.5}>
            <Typography level="h1">Privacy policy</Typography>
            <Typography level="body-sm">Last updated {lastUpdated}</Typography>
          </Stack>

          <Typography level="body-md">
            Game&apos;s Up helps friends who play together on Discord see who
            shares their games and get a game going. To do that it stores your
            Discord profile, your game library, your friends and the calls to
            play you send or answer. It does not sell your data, show ads, or
            use advertising trackers. It counts page visits with a cookieless,
            self-hosted analytics tool, described below.
          </Typography>

          <Section title="What we collect">
            <Item label="Your account.">
              When you sign in with Discord: your Discord user id, username,
              display name and avatar. You can add a time zone, a short bio and
              a note about when you usually play. Sessions are kept in a signed
              cookie in your browser; there is no password.
            </Item>
            <Item label="Linked accounts.">
              The Discord sign-in tokens that let Game&apos;s Up read the
              Discord servers you are in, and the list of those servers. If you
              link Steam, your Steam account id and the games you choose to
              import.
            </Item>
            <Item label="Your library and friends.">
              The games you add, with their platforms and your interest in them;
              the friends you add, the people you block or mute, your friends
              lists, and which shared Discord servers widen who can discover
              you. Your profile is visible to your friends by default, not to
              the public.
            </Item>
            <Item label="Calls to play.">
              Each call you send: its games, time, audience and note, who it
              went to, and how each person answered (interested, can&apos;t make
              it, running late). We also keep the ids of the Discord messages
              the bot sent for it, so it can update and later delete them.
            </Item>
            <Item label="What the bot sees in Discord.">
              In Discord servers the Game&apos;s Up bot shares with you, it sees
              which game you are playing. For people who have signed up, this is
              kept against their account and used for library suggestions, the
              trending row and prompts to start a call. People who have not
              signed up are only counted anonymously: a daily total per game and
              server, with no Discord id or anything else that identifies them.
            </Item>
            <Item label="Messages.">
              The bot cannot read what people write in Discord servers. In a
              temporary call channel it only notes that someone posted, so the
              channel is kept while it is in use. Messages you send the bot
              directly are read to carry out the command they contain; their
              text is not stored.
            </Item>
            <Item label="Page-visit statistics.">
              See &ldquo;Analytics&rdquo; below.
            </Item>
            <Typography level="body-md">
              We do not collect your email address, location, contacts, phone
              number or payment details.
            </Typography>
          </Section>

          <Section title="Analytics">
            <Typography level="body-md">
              We count visits to the Game&apos;s Up web app with Umami, an
              open-source analytics tool that we host ourselves; it is not a
              Google or Facebook service, and the data stays on our server. It
              sets no cookies and does not build a profile of you. For each page
              view it records the page&apos;s address, its title, the address of
              the site you came from, your screen size and language, and the
              browser, operating system and country it works out from the
              request. It does not keep your IP address.
            </Typography>
            <Typography level="body-md">
              Before anything is sent, the app removes what could identify you
              or someone else: everything after a <code>?</code> or{' '}
              <code>#</code> in an address, any id in a page address (a call to
              play&apos;s link is counted as <code>/play/:id</code>), and the
              title of a call to play&apos;s page. If your browser sends Do Not
              Track, nothing is recorded. Page-view records are kept until we
              delete them; they contain no IP address, cookie or account link.
            </Typography>
          </Section>

          <Section title="Who your data is shared with">
            <Typography level="body-md">
              Only the services Game&apos;s Up needs to work. We do not share
              data with advertisers or data brokers.
            </Typography>
            <List marker="disc" sx={{ '--ListItem-paddingY': '2px' }}>
              <ListItem>
                <Typography level="body-md">
                  <strong>Discord</strong>, for signing in, reading the servers
                  you are in, and sending call-to-play messages through the bot.
                  The people a call goes to see it in Discord.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  <strong>Steam</strong>, only if you link it, to import your
                  games.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  <strong>RAWG</strong>, the game catalogue we search when you
                  add a game. It receives the search text, not who you are.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  <strong>Cloudflare</strong>, which carries all traffic to
                  gamesup.app and protects the site. Like any network provider,
                  it sees your IP address and the pages you request.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  <strong>Other Game&apos;s Up users</strong>, as the app
                  intends: your friends see your profile and library, people in
                  your network see the games you share, and the people a call
                  goes to see the call and who is coming.
                </Typography>
              </ListItem>
            </List>
          </Section>

          <Section title="Security">
            <Typography level="body-md">
              All traffic to gamesup.app is encrypted with HTTPS, as are our
              requests to the services above. Discord sign-in tokens and your
              data are stored in our database on a server we run; database
              backups are kept on that server and hold the same data, with the
              same protection.
            </Typography>
          </Section>

          <Section title="How long we keep it">
            <List marker="disc" sx={{ '--ListItem-paddingY': '2px' }}>
              <ListItem>
                <Typography level="body-md">
                  The Discord messages for a call to play are deleted 12 hours
                  after the call ends, and a temporary Discord voice and text
                  space 12 hours after its last activity.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  Unfinished call-to-play drafts in Discord expire after 24
                  hours.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  Everything else is kept until your account is deleted. The
                  anonymous daily game counts contain nothing that identifies
                  anyone and are kept.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  Analytics page-view records are kept until we delete them.
                </Typography>
              </ListItem>
              <ListItem>
                <Typography level="body-md">
                  Backup copies of the database are replaced as new ones are
                  taken; the newest ten are kept.
                </Typography>
              </ListItem>
            </List>
          </Section>

          <Section title="Deleting your account">
            <Typography level="body-md">
              Email {contactLink} to have your account deleted, naming the
              Discord account you sign in with. Deleting it removes your
              profile, linked accounts and tokens, library, friends, lists,
              calls to play, answers and activity history. Discord messages the
              bot already sent stay in Discord.
            </Typography>
          </Section>

          <Section title="Contact">
            <Typography level="body-md">
              Questions about privacy or your data: {contactLink}.
            </Typography>
          </Section>

          <Link href="/" level="body-sm">
            Back to Game&apos;s Up
          </Link>
        </Stack>
      </Sheet>
    </CssVarsProvider>
  )
}
