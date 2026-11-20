import { Platform } from 'react-native';

/**
 * Dark, high-contrast palette tuned for in-car use: large glanceable numbers,
 * one accent for "live" state and distinct colours for warnings.
 */
export const colors = {
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
} as const;

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
