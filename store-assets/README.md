# Store and README assets

Screenshots of Game's Up for the README (LIST-8). `manifest.json` lists each one with its raw source, theme, caption and alt text, in order; the README shows them in that order.

- `raw/web/` holds the full-resolution captures (2880 by 1800: a 1440 by 900 browser at 2x scale).
- `readme/` holds the copies the README shows, scaled to 1440 pixels wide.

They are captured from the production image, in the dark theme, against a throwaway database filled with the repo's synthetic seed (`apps/api/prisma/seed.ts`), signed in as a seed user. No real people, servers or accounts appear. Before capturing, rename the seed's main account handle in that throwaway database (it matches a real handle), and check every game cover has loaded. New or changed screenshots are approved by the maintainer before they are committed.
