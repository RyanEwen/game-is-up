/**
 * The Classic theme: the app's original dark atmospheric look — navy-slate
 * surfaces, brand teal-green primary, and the teal spectrum ambient wash.
 * Values here are the pre-engine hardcodes, expressed through createAppTheme
 * so every shell treatment now flows from a chrome slot. The app default is
 * Gold Bubble; the registry and default live in `themes.ts`.
 */
import { createAppTheme, type GameThemePalette } from './buildTheme'

export const classicChrome: GameThemePalette['chrome'] = {
  bodyBackground:
    'radial-gradient(circle at top left, #0f5444 0%, #304159 100%)',
  bodyBackgroundColor: '#070b14',
  ambientOverlayBase:
    'linear-gradient(132deg, rgba(8, 14, 24, 0.03) 0%, rgba(8, 14, 24, 0.09) 100%)',
  ambientOverlayGlow:
    'radial-gradient(circle at 50% 10%, rgba(255, 255, 255, 0.08), transparent 34%)',
  ambientHighlight:
    'radial-gradient(circle at 50% 8%, rgba(255, 255, 255, 0.12), transparent 32%)',
  ambientSpectrum:
    'linear-gradient(115deg, #92f7de 0%, #70ebcd 28%, #61d4bf 58%, #a9f3de 100%)',
  heroBackground:
    'linear-gradient(135deg, var(--joy-palette-neutral-900) 0%, var(--joy-palette-background-level2) 64%, rgba(var(--joy-palette-primary-darkChannel) / 0.22) 100%)',
  heroBorder: 'var(--joy-palette-neutral-700)',
  installCardBackground: 'linear-gradient(135deg, #173048, #16273a)',
  installCardBorder: '#245f74',
  tabBarBackground: 'rgba(13, 23, 38, 0.84)',
  tabBarBorder: 'rgba(118, 164, 220, 0.18)',
  tabBarShadow: [
    '0 14px 26px -18px rgba(0, 0, 0, 0.92)',
    '0 1px 0 rgba(197, 224, 255, 0.16)',
    'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    '0 0 0 1px rgba(88, 130, 184, 0.14)',
  ].join(', '),
  tabBarBackdropFilter: 'blur(10px) saturate(1.04)',
  tabHoverBackground: 'rgba(255, 255, 255, 0.04)',
  tabHoverColor: 'var(--joy-palette-neutral-100)',
  tabSelectedColor: 'var(--joy-palette-primary-200)',
  tabSelectedBackground:
    'linear-gradient(180deg, rgba(20, 136, 106, 0.26), rgba(15, 84, 68, 0.18))',
  tabSelectedShadow:
    'inset 0 0 0 1px rgba(141, 255, 216, 0.16), 0 10px 20px -16px rgba(15, 84, 68, 0.9)',
  sectionNavBackground: 'rgba(18, 34, 48, 0.72)',
  sectionNavBorder: 'rgba(129, 166, 214, 0.22)',
  sectionNavShadow: [
    '0 14px 26px -18px rgba(0, 0, 0, 0.72)',
    'inset 0 -1px 0 rgba(255, 255, 255, 0.05)',
    '0 0 0 1px rgba(113, 160, 214, 0.12)',
  ].join(', '),
  sectionNavBackdropFilter: 'blur(12px) saturate(1.06)',
  sectionNavText: 'var(--joy-palette-neutral-300)',
  sectionNavTextHover: 'var(--joy-palette-neutral-100)',
  sectionNavFocusRing: 'rgba(129, 166, 214, 0.6)',
  sectionNavCount: 'var(--joy-palette-neutral-400)',
  sectionNavSeparator: 'rgba(255, 255, 255, 0.26)',
  toastBackground: '#121a28',
  toastBorder: '#304159',
  modalDialogBackground: '#0f1726',
  modalDialogBorder: '#304159',
  primarySoftCardGradientStart: '#12342d',
  primarySoftCardGradientEnd: '#0d1322',
}

export const classicTheme = createAppTheme({
  primary: {
    50: '#e6fff6',
    100: '#c2ffea',
    200: '#8dffd8',
    300: '#57f4c1',
    400: '#33d7a6',
    500: '#1cab84',
    600: '#14886a',
    700: '#106a54',
    800: '#0f5444',
    900: '#0d463a',
  },
  warning: {
    50: '#fffde8',
    100: '#fff7b3',
    200: '#ffeb75',
    300: '#ffdd3f',
    400: '#f2c91c',
    500: '#cda700',
    600: '#9d8100',
    700: '#766200',
    800: '#524500',
    900: '#312a00',
  },
  neutral: {
    50: '#f8fafc',
    100: '#e1e7ef',
    200: '#c1ccda',
    300: '#d3dde7',
    400: '#c4d0dd',
    500: '#687a94',
    600: '#506077',
    700: '#3b4d66',
    800: '#243043',
    900: '#161d2e',
  },
  chrome: classicChrome,
  background: {
    body: '#070b14',
    surface: 'rgba(19, 27, 42, 0.5)',
    popup: '#121a28',
    level1: 'rgba(19, 27, 42, 0.6)',
    level2: '#24364d',
    level3: '#355076',
  },
  text: {
    primary: '#fff',
    secondary: '#d1dbe5',
    tertiary: '#bdcad9',
    icon: '#bdcad9',
  },
})
