/** Private game-library management. Controls route without process-local session state. */
import { ButtonStyle } from 'discord.js'
import type { DiscordNotice } from './discord-notices.js'
import { z } from 'zod'
import {
  libraryEntryIntentSchema,
  type UpsertLibraryEntryRequest,
} from '@game-is-up/shared'
import {
  findOrCreateGameFromCatalogMatch,
  searchGamesByTitle,
} from './game-catalog.js'
import { getGameDetails } from './game-details.js'
import {
  getLibraryEntries,
  removeLibraryEntry,
  saveLibraryGame,
} from './library.js'
import { prisma } from './prisma.js'
import {
  type AccountPanelInteraction,
  panelRevision,
  parsePanelRevision,
  panelAppButton,
  panelButton,
  panelModal,
  panelPage,
  panelPaging,
  panelRow,
  panelSelect,
  panelView,
} from './discord-account-panel.js'

/** Accept display labels and existing API slugs without making users type storage syntax. */
export function parsePanelPlayInterest(value: string) {
  return libraryEntryIntentSchema.parse(
    value.trim().toLowerCase().replace(/\s+/g, '-'),
  )
}

/** Empty libraries can start here without finishing web onboarding first. */
export async function renderGamesPanel(
  userId: string,
  actor: string,
  requestedPage = 0,
  notice: DiscordNotice | null = null,
) {
  const entries = await getLibraryEntries(userId)
  const { page, pageCount, items } = panelPage(entries, requestedPage)
  const rows = []
  if (items.length) {
    rows.push(
      panelSelect(
        actor,
        'game',
        'Choose a game to edit or remove',
        items.map((entry) => ({
          label: entry.game.title,
          value: entry.id,
          description: `${entry.platforms.map((platform) => platform.platformLabel).join(', ')} | ${entry.intentType.toLowerCase().replaceAll('_', ' ')}`,
        })),
      ),
    )
  }
  rows.push(...panelPaging(actor, 'games', page, pageCount))
  rows.push(
    panelRow(
      panelButton(
        actor,
        'game-search',
        'Search catalog',
        [],
        ButtonStyle.Primary,
      ),
      panelAppButton('/library'),
    ),
  )
  return panelView(
    'My games',
    items.length
      ? `Choose a game below. Page ${page + 1} of ${pageCount}. Search the catalog to add another game.`
      : 'Your library is empty. Search the catalog to add your first game, choose platforms, and set your play interest. You can also finish setup in the App.',
    rows,
    notice,
  )
}

/** Search uses the same provider and eight-result limit as web; controls carry stable catalog references. */
async function searchGames(actor: string, query: string) {
  const results = await searchGamesByTitle(
    z.string().trim().min(2).max(80).parse(query),
  )
  const rows = []
  if (results.length) {
    rows.push(
      panelSelect(
        actor,
        'game-add',
        'Choose a game to add',
        results.map((game) => ({
          label: game.title,
          value: `${game.source}:${game.sourceId}`,
        })),
      ),
    )
  }
  rows.push(
    panelRow(
      panelButton(actor, 'game-search', 'Search again'),
      panelButton(actor, 'games', 'My games'),
      panelAppButton('/library'),
    ),
  )
  return panelView(
    'Catalog search',
    results.length
      ? 'Choose a game, then set your platforms and play interest. Refine your search if your game is missing.'
      : 'No catalog matches. Try a different title, or use the App to add a custom title.',
    rows,
  )
}

async function loadOwnedEntry(userId: string, entryId: string) {
  z.string().uuid().parse(entryId)
  return prisma.userGameInterest.findFirst({
    where: { id: entryId, userId },
    include: { game: true, platforms: true },
  })
}

async function renderGame(userId: string, actor: string, entryId: string) {
  const entry = await loadOwnedEntry(userId, entryId)
  if (!entry) {
    return renderGamesPanel(userId, actor, 0, {
      severity: 'error',
      message: 'That game entry no longer exists. Choose a current entry.',
    })
  }
  return panelView(
    'My game',
    `${entry.game.title}\nPlatforms: ${entry.platforms.map((platform) => platform.platformLabel).join(', ')}\nPlay interest: ${entry.intentType.toLowerCase().replaceAll('_', ' ')}\nAvailability: ${entry.availability || 'Your usual availability'}`,
    [
      panelRow(
        panelButton(
          actor,
          'game-edit',
          'Edit',
          [entry.id],
          ButtonStyle.Primary,
        ),
        panelButton(
          actor,
          'game-remove',
          'Remove',
          [entry.id],
          ButtonStyle.Danger,
        ),
        panelButton(actor, 'games', 'My games'),
        panelAppButton('/library'),
      ),
    ],
  )
}

/** Resolve a stable catalog reference after acknowledgement, then offer a local-only form launch. */
async function renderCatalogSelection(
  userId: string,
  actor: string,
  reference: string,
) {
  const [rawSource, rawSourceId] = reference.split(':')
  const source = z.enum(['local', 'rawg', 'steam']).parse(rawSource)
  const sourceId = z.string().min(1).max(96).parse(rawSourceId)
  const match = await getGameDetails(source, sourceId)
  if (!match) {
    return renderGamesPanel(userId, actor, 0, {
      severity: 'error',
      message: 'That catalog game is unavailable. Search again.',
    })
  }
  const game = await findOrCreateGameFromCatalogMatch({
    source: match.source,
    sourceId: match.sourceId,
    title: match.title,
    coverUrl: match.coverUrl,
    platformLabels: match.platformLabels,
  })
  return panelView(
    'Add game',
    `${game.title}\n\nChoose your platforms and play interest to add this game.`,
    [
      panelRow(
        panelButton(
          actor,
          'game-configure',
          'Set platforms and interest',
          [game.id],
          ButtonStyle.Primary,
        ),
        panelButton(actor, 'game-search', 'Search again'),
        panelButton(actor, 'games', 'My games'),
        panelAppButton('/library'),
      ),
    ],
  )
}

/** Only modal-opening actions reserve the initial Discord response. */
export function gamesActionOpensModal(action: string) {
  return ['game-search', 'game-configure', 'game-edit'].includes(action)
}

/** Handle game actions after the hub has authenticated and checked the actor. */
export async function handleGamesPanel(
  interaction: AccountPanelInteraction,
  userId: string,
  action: string,
  args: string[],
) {
  const actor = interaction.user.id
  const target = interaction.isStringSelectMenu()
    ? interaction.values[0]
    : args[0]
  if (action === 'games') {
    return renderGamesPanel(userId, actor, Number(args[0] ?? 0))
  }
  if (action === 'game-search' && interaction.isButton()) {
    await interaction.showModal(
      panelModal(actor, 'game-search-save', 'Search the game catalog', [
        { id: 'query', label: 'Game title (at least 2 characters)', max: 80 },
      ]),
    )
    return
  }
  if (action === 'game-search-save' && interaction.isModalSubmit()) {
    return searchGames(actor, interaction.fields.getTextInputValue('query'))
  }
  if (action === 'game' && target) {
    return renderGame(userId, actor, target)
  }
  if (action === 'game-add' && interaction.isStringSelectMenu() && target) {
    // Catalog resolution can use a remote provider. The ordinary selection
    // acknowledgement must happen before this work; opening a modal comes later.
    return renderCatalogSelection(userId, actor, target)
  }
  if (
    (action === 'game-configure' || action === 'game-edit') &&
    interaction.isButton() &&
    target
  ) {
    const entry =
      action === 'game-edit'
        ? await loadOwnedEntry(userId, target)
        : await prisma.userGameInterest.findFirst({
            where: { userId, gameId: z.string().uuid().parse(target) },
            include: { game: true, platforms: true },
          })
    if (action === 'game-edit' && !entry) {
      return renderGamesPanel(userId, actor, 0, {
        severity: 'error',
        message: 'That game entry no longer exists.',
      })
    }
    const game = await prisma.game.findUnique({
      where: { id: entry?.gameId ?? z.string().uuid().parse(target) },
      include: { platforms: true },
    })
    if (!game) {
      return renderGamesPanel(userId, actor, 0, {
        severity: 'error',
        message: 'That catalog game is unavailable. Search again.',
      })
    }
    const platformText =
      entry?.platforms.map((platform) => platform.platformLabel).join(', ') ??
      ''
    // Oversized saved lists remain intact. Blank editing preserves platform rows in place.
    const platformValue = platformText.length <= 4000 ? platformText : undefined
    await interaction.showModal(
      panelModal(
        actor,
        entry ? 'game-edit-save' : 'game-add-save',
        entry ? 'Edit game' : 'Add game',
        [
          {
            id: 'platforms',
            label: entry
              ? 'Platforms (blank keeps current)'
              : 'Platforms, separated by commas',
            max: 4000,
            value: platformValue,
            required: !entry,
            placeholder: entry
              ? 'Separate replacements with commas, or leave blank to keep every current platform'
              : game.platforms
                  .map((platform) => platform.platformLabel)
                  .join(', ')
                  .slice(0, 100) || 'PC, PlayStation 5',
          },
          {
            id: 'intent',
            label: 'Interested, Wishlist, or Playing now',
            max: 20,
            value:
              entry && entry.intentType !== 'COMPLETED'
                ? entry.intentType.toLowerCase().replaceAll('_', ' ')
                : 'interested',
          },
          {
            id: 'availability',
            label: 'Availability (blank uses your usual)',
            max: 80,
            value: entry?.availability ?? '',
            required: false,
          },
        ],
        entry ? [entry.id, panelRevision(entry.updatedAt)] : [game.id],
      ),
    )
    return
  }
  if (
    (action === 'game-add-save' || action === 'game-edit-save') &&
    interaction.isModalSubmit() &&
    target
  ) {
    const entry =
      action === 'game-edit-save' ? await loadOwnedEntry(userId, target) : null
    if (action === 'game-edit-save' && !entry) {
      return renderGamesPanel(userId, actor, 0, {
        severity: 'error',
        message:
          'That game entry no longer exists. Your changes were not saved.',
      })
    }
    const game = await prisma.game.findUnique({
      where: { id: entry?.gameId ?? z.string().uuid().parse(target) },
    })
    if (!game) {
      return renderGamesPanel(userId, actor, 0, {
        severity: 'error',
        message: 'That catalog game is unavailable. Search again.',
      })
    }
    const enteredPlatforms = interaction.fields
      .getTextInputValue('platforms')
      .trim()
    const preservePlatforms = Boolean(entry && !enteredPlatforms)
    const payload: UpsertLibraryEntryRequest = {
      title: game.title.slice(0, 80),
      platformLabels:
        preservePlatforms && entry
          ? entry.platforms.map((platform) => platform.platformLabel)
          : enteredPlatforms
              .split(',')
              .map((label) => label.trim())
              .filter(Boolean),
      intent: parsePanelPlayInterest(
        interaction.fields.getTextInputValue('intent'),
      ),
      availability: interaction.fields.getTextInputValue('availability'),
    }
    await saveLibraryGame(
      userId,
      game.id,
      payload,
      entry
        ? {
            kind: 'edit',
            entryId: entry.id,
            updatedAt: parsePanelRevision(args[1]),
            preservePlatforms,
          }
        : { kind: 'create' },
    )
    return renderGamesPanel(userId, actor, 0, {
      severity: 'success',
      message: 'Game saved.',
    })
  }
  if (action === 'game-remove' && target) {
    const entry = await loadOwnedEntry(userId, target)
    if (!entry) {
      return renderGamesPanel(userId, actor, 0, {
        severity: 'error',
        message: 'That game entry no longer exists.',
      })
    }
    return panelView(
      'Remove game?',
      `Remove ${entry.game.title} from your library?`,
      [
        panelRow(
          panelButton(
            actor,
            'game-remove-confirm',
            'Remove game',
            [entry.id, panelRevision(entry.updatedAt)],
            ButtonStyle.Danger,
          ),
          panelButton(actor, 'game', 'Cancel', [entry.id]),
        ),
      ],
    )
  }
  if (action === 'game-remove-confirm' && target) {
    z.string().uuid().parse(target)
    const removed = await removeLibraryEntry(
      userId,
      target,
      parsePanelRevision(args[1]),
    )
    return renderGamesPanel(userId, actor, 0, {
      severity: removed ? 'success' : 'error',
      message: removed
        ? 'Game removed.'
        : 'That game entry was already removed.',
    })
  }
  return renderGamesPanel(userId, actor, 0, {
    severity: 'error',
    message: 'That control is out of date. Choose an action below.',
  })
}
