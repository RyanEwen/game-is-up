# UI conventions

Read when: building or changing any screen, dialog, or shared component in the web app.
Governs: `apps/web/src/**`

These are Game's Up's own UI conventions. The conventions shared across the app family are in the standards' [ui.md](https://github.com/Dynamic-Solutions-Canada/app-standards/blob/main/standards/ui.md); where this guide is silent, follow that file.

## Look and theming

- Keep the established visual direction: a dark atmospheric shell, strong typography, and cards with clear information density.
- Theming goes through the engine in `apps/web/src/theme/buildTheme.ts`: a theme is a Joy palette plus typed `chrome` slots emitted as `--gu-*` CSS variables, applied at the document root by `useChromeCssVars`.
- Shell chrome (body background, ambient overlays, hero, tab bar, toasts, install card, modals) styles with `var(--gu-...)`. Never hardcode per-theme colours in shell components.
- To add a theme, define its palette and chrome in `themes.ts` and register it in `appThemeVariants`. The exhaustive record over `AppThemeId` fails typecheck if a registered id lacks a variant.
- Per-device theme selection persists through `useDeviceTheme` (local storage). Brand surfaces such as the invite landing stay pinned to the default theme.
- Content components stay theme-aware: use Joy palette variables (`var(--joy-palette-...)`, `rgba(var(--joy-palette-<color>-<main|light|dark>Channel) / a)`), not hex colours. The one sanctioned exception is the Material date-time picker palette record in `PlayIntentComposerCard`, which needs concrete colours per theme.

## Dialogs

- Every dialog is a `DashboardModal` (`components/dashboard/DashboardModal.tsx`). It registers the dialog in browser history so Back closes the top dialog first; do not open a raw Joy `Modal`.
- Dialog buttons go in `DashboardModalActionBar`, which fixes the order: secondary action, then primary action, then cancel pushed to the far right. Pass the buttons to its slots rather than laying out a footer by hand.
- Do not use `window.confirm` or `window.alert`. A destructive action gets a confirm dialog built on `DashboardModal`. (One `window.confirm` remains in `PlayIntentDetailView.tsx` and is scheduled for replacement.)

## Empty states, notices and actions

- An empty list or a signed-out section uses `EmptyStateCard` (`components/dashboard/EmptyStateCard.tsx`): a title, one line of body text, optional chips, and the Discord sign-in card when the viewer is signed out. Do not render bare grey text for an empty state.
- Auto-dismissing notices and banners in dashboard hooks go through `useTimedNotice`.
- Per-item actions on a person or a game open from that item through `FriendActionPopover` or `GameActionPopover`.

## Icons

- Directional actions use the rounded MUI arrows: `WestRoundedIcon` for back or return, `EastRoundedIcon` for forward or detail. Put the icon in the button's decorator, never an inline Unicode arrow in the label.

## PWA install

- Show the install call to action only when the browser can actually install the app: wait for `beforeinstallprompt` on Chromium, use the manual fallback only on iOS Safari, and show nothing in unsupported or already-installed browsers.
