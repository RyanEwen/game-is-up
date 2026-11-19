# Brand masters

The Game's Up mark's hand-authored masters live here (ASSET-1, ASSET-2): a gold-outlined speech bubble on ink `#17181D` holding "GAME'S" in white and "UP!" in gold `#F7B733`, with the wordmark set in Archivo Black and already converted to path outlines, so no font is needed to edit or render them. `npm run icons` (devkit-icons) writes every PWA icon, the apple-touch icon and the `assets/generated/` exports from them, and `npm run check:icons`, part of `validate`, fails when a committed icon no longer matches its master. `icons.json` says where the outputs go. Generated files are never edited by hand.

- `icon.svg`: the full mark, used for the manifest icons, the apple-touch icon, the in-app header logo and the README and promo exports.
- `icon-maskable.svg`: the same art scaled to 80% so mask shapes never clip the bubble, used for the maskable manifest icons.

The masters keep a stroked `<rect>` and a `<g transform>`, which the web target accepts. Only devkit's Android vectors need flat `<path d fill>` art, so convert them if the app ever gains an Android target.

## App-owned extras

These sit outside the generator and are committed as they are:

- `extras/favicon-up-bang.svg`: the "UP!" cut used for the browser tab icon, because the full wordmark is unreadable at tab size. Its 64 px render is served as `apps/web/public/icon-up-bang-64.png`.
- `extras/discord-server-icon-1024.png`: the app icon at 1024 px, uploaded by hand as the Discord server icon.
- `extras/discord-bot-avatar.svg` with its 1024 and 512 px renders: the bot's avatar (a solid gold bubble with an ink "!"), uploaded by hand in the Discord developer portal.

When changing a master, run `npm run icons` and bump `pwaIconVersion` in `apps/web/vite.config.ts` and the matching `?v=` in `apps/web/index.html`, so installed copies refetch. Re-render and re-upload the extras by hand if the art they share changes.
