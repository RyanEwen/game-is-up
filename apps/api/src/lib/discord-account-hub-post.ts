/** Persistent public hub payload. No personal data or per-user state belongs in this post. */
import { ButtonStyle } from 'discord.js'
import { buildPlayUrl } from './discord-invite-links.js'
import { panelButton, panelRow, panelView } from './discord-account-panel.js'
import { buildOpenInAppButton } from './discord-dm-formatting.js'

/** Retain the original composer custom id so existing posts and saved controls keep working. */
export function buildAccountHubPostPayload() {
  return panelView(
    "Game's Up",
    [
      'Find your people and send out a call to play.',
      "New here? Join Game's Up with your Discord account, then set up your games and friends in the App.",
      "My games, My friends, and the call-to-play composer open private panels that only you can see. Friends here are your Game's Up follows.",
    ].join('\n\n'),
    [
      panelRow(
        panelButton('open', 'join', "Join Game's Up", [], ButtonStyle.Primary),
        // This id is deliberately owned by the unchanged composer dispatcher.
        panelButton('open', 'games', 'Send out a call to play').setCustomId(
          'guild-ctp:open',
        ),
      ),
      panelRow(
        panelButton('open', 'games', 'My games'),
        panelButton('open', 'friends', 'My friends'),
        buildOpenInAppButton(buildPlayUrl(), 'App'),
      ),
    ],
  )
}
