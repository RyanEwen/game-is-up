/**
 * Every outside link the app shows about itself, named once (BRAND-8). The About dialog and
 * the footer read from here, so a moved repository or a new privacy page is one edit.
 */

const repositoryUrl = 'https://github.com/RyanEwen/game-is-up'

export const productLinks = {
  /** The public address of the app. */
  app: 'https://gamesup.app',
  sourceCode: repositoryUrl,
  /** GitHub issues, which open with the bug report template (D-086, HYG-9). */
  support: `${repositoryUrl}/issues`,
  license: `${repositoryUrl}/blob/main/LICENSE`,
  /** Written into the web build by `devkit-notices` (configured in devkit.config.mjs). */
  thirdPartyNotices: '/THIRD-PARTY-NOTICES.txt',
  /** Not published yet (DOCS-8, D-017); the About dialog and footer omit it until it is. */
  privacyPolicy: null as string | null,
} as const
