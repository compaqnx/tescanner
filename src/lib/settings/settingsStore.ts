import Storage from 'expo-sqlite/kv-store';

/**
 * Small persisted app preferences, backed by expo-sqlite's key-value store.
 * Reads are synchronous so values such as the theme are known before the first
 * render. Every access is guarded: a storage failure falls back to defaults and
 * never breaks the app.
 */

const KEYS = {
  themeMode: 'settings.themeMode',
  vehicleProfile: 'settings.vehicleProfile',
  packReferenceKwh: 'settings.packReferenceKwh',
} as const;

/** Original pack capacity for the SOH estimate; null = automatic. */
export function loadPackReferenceKwh(): number | null {
  const value = Number(readSync(KEYS.packReferenceKwh));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function savePackReferenceKwh(kwh: number | null): void {
  writeSync(KEYS.packReferenceKwh, kwh === null ? '' : String(kwh));
}

export type ThemeMode = 'system' | 'dark' | 'light';

function readSync(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

function writeSync(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

export function loadThemeMode(): ThemeMode {
  const value = readSync(KEYS.themeMode);
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
}

export function saveThemeMode(mode: ThemeMode): void {
  writeSync(KEYS.themeMode, mode);
}

export function loadVehicleProfileId(): string | null {
  return readSync(KEYS.vehicleProfile);
}

export function saveVehicleProfileId(id: string): void {
  writeSync(KEYS.vehicleProfile, id);
}
