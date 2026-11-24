import { Appearance, Platform } from 'react-native';
import { loadThemeMode, type ThemeMode } from '../lib/settings/settingsStore';

export type ColorScheme = 'dark' | 'light';

export interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  neon: string;
  onNeon: string;
  live: string;
  info: string;
  warn: string;
  danger: string;
  dangerBg: string;
  regen: string;
  drive: string;
}

/**
 * Dark, high-contrast palette tuned for in-car use: large glanceable numbers,
 * one accent for "live" state and distinct colours for warnings.
 */
const DARK: Palette = {
  bg: '#0E0F10',
  surface: '#16191A',
  surfaceRaised: '#1D2122',
  border: '#2A2F2F',
  borderStrong: '#3A4140',
  text: '#EFF3F2',
  textMuted: '#9BA2A0',
  textDim: '#6F7B7A',
  neon: '#C7FF19',
  onNeon: '#0D1608',
  live: '#20D69A',
  info: '#67B7FF',
  warn: '#F5B66A',
  danger: '#FF7E7E',
  dangerBg: '#3A1717',
  regen: '#20D69A',
  drive: '#C7FF19',
};

/**
 * Light palette for daylight use. Accents are darkened so they keep at least
 * 4.5:1 contrast as text on white (the dark theme's lime would not).
 */
const LIGHT: Palette = {
  bg: '#F3F5F4',
  surface: '#FFFFFF',
  surfaceRaised: '#ECEFEE',
  border: '#D8DDDB',
  borderStrong: '#BFC7C4',
  text: '#121616',
  textMuted: '#4F5A58',
  textDim: '#6B7775',
  neon: '#4F7300',
  onNeon: '#FFFFFF',
  live: '#0B7F57',
  info: '#1765C0',
  warn: '#9A5B00',
  danger: '#C62E2E',
  dangerBg: '#FBE3E3',
  regen: '#0B7F57',
  drive: '#4F7300',
};

const PALETTES: Record<ColorScheme, Palette> = { dark: DARK, light: LIGHT };

export function resolveColorScheme(mode: ThemeMode, systemScheme: string | null | undefined): ColorScheme {
  if (mode === 'system') {
    return systemScheme === 'light' ? 'light' : 'dark';
  }
  return mode;
}

let activeScheme: ColorScheme = resolveColorScheme(loadThemeMode(), Appearance.getColorScheme());
let themeVersion = 0;

/**
 * The live palette. Screens read `colors.x` while rendering, so it is mutated in
 * place on a theme switch (see applyColorScheme) and the next render picks up
 * the new values without every import having to change.
 */
export const colors: Palette = { ...PALETTES[activeScheme] };

export function getColorScheme(): ColorScheme {
  return activeScheme;
}

/**
 * Switches the live palette. Called by the app provider during render, before
 * any screen renders, so a single re-render repaints everything.
 */
export function applyColorScheme(scheme: ColorScheme): void {
  if (scheme === activeScheme) {
    return;
  }
  activeScheme = scheme;
  Object.assign(colors, PALETTES[scheme]);
  themeVersion += 1;
}

/**
 * A fixed accent colour (system accents, chart series) adjusted for the active
 * theme. Accents are tuned for the dark background; on the light theme they are
 * darkened so text and icons in that colour keep their contrast on white (the
 * lime Energy Storage accent was nearly invisible).
 */
export function accentColor(hex: string): string {
  if (activeScheme !== 'light') {
    return hex;
  }
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    return hex;
  }
  const scale = 0.58;
  return `#${match
    .slice(1, 4)
    .map((part) => Math.round(parseInt(part, 16) * scale).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Wraps a module-level style sheet so it is rebuilt from the current palette
 * after a theme switch: `const styles = themed(() => StyleSheet.create({...}))`.
 * The factory runs lazily on first access and again once per theme change.
 */
export function themed<T extends object>(factory: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;

  const current = (): T => {
    if (cache === null || builtFor !== themeVersion) {
      cache = factory();
      builtFor = themeVersion;
    }
    return cache;
  };

  return new Proxy({} as T, {
    get: (_target, property) => Reflect.get(current(), property),
    has: (_target, property) => Reflect.has(current(), property),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum comfortable touch target (Material: 48dp, iOS HIG: 44pt). */
export const TOUCH_TARGET = 48;

export const fonts = {
  heading: Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: 'System' }),
  body: Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: 'System' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};
