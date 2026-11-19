/**
 * Every outside link the app shows about itself, named once (BRAND-8). The About dialog and
 * the footer read from here, so a moved repository or a new privacy page is one edit.
 */

const repositoryUrl = 'https://github.com/RyanEwen/game-is-up'

export const productLinks = {
  sourceCode: repositoryUrl,
  /** GitHub issues, which open with the bug report template (D-086, HYG-9). */
  support: `${repositoryUrl}/issues`,
  license: `${repositoryUrl}/blob/main/LICENSE`,
  /** Generated into the web build by scripts/dev/generate-third-party-notices.mjs. */
  thirdPartyNotices: '/THIRD-PARTY-NOTICES.txt',
  /** Not published yet (DOCS-8, D-017); the About dialog and footer omit it until it is. */
  privacyPolicy: null as string | null,
} as const
