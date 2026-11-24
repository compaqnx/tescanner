import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, useColorScheme } from 'react-native';
import { LocaleCode, localizeTelemetryError, TranslationKey, translate } from '../lib/i18n/localization';
import { loadThemeMode, saveThemeMode, type ThemeMode } from '../lib/settings/settingsStore';
import { applyColorScheme, resolveColorScheme, type ColorScheme } from '../ui/theme';
import {
  buildSignalIndex,
  computeAlerts,
  readKpis,
  SignalIndex,
  SignalReading,
  SystemAlert,
  SystemCoverage,
  systemCoverage,
} from '../lib/systems/readSignals';
import { SYSTEMS, type SystemId } from '../lib/systems/systemCatalog';
import { useTelemetryController } from './useTelemetryController';

type Controller = ReturnType<typeof useTelemetryController>;

export interface StoredError {
  id: number;
  message: string;
  createdAt: number;
}

export interface SystemSummary {
  kpis: SignalReading[];
  coverage: SystemCoverage;
}

export interface AppContextValue extends Omit<Controller, 'startStreaming'> {
  /** Starts with the current selection (never pass a press event through). */
  startStreaming: () => Promise<void>;
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  /** User preference: follow the OS, or force dark / light. Persisted. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** The scheme actually in use after resolving 'system'. */
  colorScheme: ColorScheme;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  localizedError: string | null;
  storedErrors: StoredError[];
  clearStoredErrors: () => void;
  isConnected: boolean;
  isStreaming: boolean;
  isBusy: boolean;
  /** Name of the action in flight, so buttons can show progress and avoid double taps. */
  actionBusy: string | null;
  runAction: (name: string, action: () => Promise<unknown>) => Promise<void>;
  signalIndex: SignalIndex;
  alerts: SystemAlert[];
  systemSummaries: Record<SystemId, SystemSummary>;
  framesPerSecond: number;
  /** Exports one session (or the latest) as CSV and alerts when there is nothing to export. */
  exportWithFeedback: (sessionId?: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const controller = useTelemetryController();
  const { error, status, signals, frameCount, exportLatestSession, exportSession } = controller;

  const [locale, setLocale] = useState<LocaleCode>('en');

  const [themeMode, setThemeModeState] = useState<ThemeMode>(loadThemeMode);
  const systemScheme = useColorScheme();
  const colorScheme = resolveColorScheme(themeMode, systemScheme);
  // Switch the shared palette during render, before any child renders, so this
  // one render pass repaints every screen (styles rebuild lazily via themed()).
  applyColorScheme(colorScheme);
  const setThemeMode = useCallback((mode: ThemeMode) => {
    saveThemeMode(mode);
    setThemeModeState(mode);
  }, []);
  const [storedErrors, setStoredErrors] = useState<StoredError[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [framesPerSecond, setFramesPerSecond] = useState(0);

  const previousErrorRef = useRef<string | null>(null);
  const errorSeqRef = useRef(0);
  const frameSampleRef = useRef({ count: 0, at: Date.now() });
  const latestFrameCountRef = useRef(frameCount);
  useEffect(() => {
    latestFrameCountRef.current = frameCount;
  }, [frameCount]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const localizedError = useMemo(() => localizeTelemetryError(locale, error), [error, locale]);

  // Keep a short history of distinct errors for the Diagnose > Events tab.
  useEffect(() => {
    if (!localizedError) {
      previousErrorRef.current = null;
      return;
    }
    if (previousErrorRef.current !== localizedError) {
      const id = (errorSeqRef.current += 1);
      setStoredErrors((current) => [{ id, message: localizedError, createdAt: Date.now() }, ...current].slice(0, 80));
    }
    previousErrorRef.current = localizedError;
  }, [localizedError]);

  // Frame rate shown in the connection bar, sampled once per second.
  useEffect(() => {
    if (status !== 'streaming') {
      setFramesPerSecond(0);
      return;
    }
    frameSampleRef.current = { count: latestFrameCountRef.current, at: Date.now() };
    const timer = setInterval(() => {
      const now = Date.now();
      const sample = frameSampleRef.current;
      const latest = latestFrameCountRef.current;
      const seconds = Math.max(0.001, (now - sample.at) / 1000);
      setFramesPerSecond(Math.max(0, (latest - sample.count) / seconds));
      frameSampleRef.current = { count: latest, at: now };
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const runAction = useCallback(async (name: string, action: () => Promise<unknown>) => {
    setActionBusy(name);
    try {
      await action();
    } catch {
      // Errors are surfaced through controller state.
    } finally {
      setActionBusy(null);
    }
  }, []);

  const exportWithFeedback = useCallback(
    async (sessionId?: string) => {
      setActionBusy(sessionId ? `export-${sessionId}` : 'export');
      try {
        const uri = sessionId ? await exportSession(sessionId) : await exportLatestSession();
        if (!uri) {
          Alert.alert(translate(locale, 'exportNoDataTitle'), translate(locale, 'exportNoData'));
        }
      } catch (exportError) {
        const message = exportError instanceof Error ? exportError.message : String(exportError);
        Alert.alert(translate(locale, 'exportNoDataTitle'), localizeTelemetryError(locale, message) ?? message);
      } finally {
        setActionBusy(null);
      }
    },
    [exportLatestSession, exportSession, locale],
  );

  const signalIndex = useMemo(() => buildSignalIndex(signals), [signals]);
  const alerts = useMemo(() => computeAlerts(signalIndex), [signalIndex]);
  // Computed once per signal flush (not per CAN frame) and shared by Live + Systems.
  const systemSummaries = useMemo(() => {
    const summaries = {} as Record<SystemId, SystemSummary>;
    for (const system of SYSTEMS) {
      summaries[system.id] = { kpis: readKpis(system, signalIndex), coverage: systemCoverage(system, signalIndex) };
    }
    return summaries;
  }, [signalIndex]);

  const controllerStart = controller.startStreaming;
  const startStreaming = useCallback(() => controllerStart(), [controllerStart]);

  const value: AppContextValue = {
    ...controller,
    startStreaming,
    locale,
    setLocale,
    themeMode,
    setThemeMode,
    colorScheme,
    t,
    localizedError,
    storedErrors,
    clearStoredErrors: () => setStoredErrors([]),
    isConnected: status === 'connected' || status === 'streaming',
    isStreaming: status === 'streaming',
    isBusy: status === 'booting' || status === 'connecting',
    actionBusy,
    runAction,
    signalIndex,
    alerts,
    systemSummaries,
    framesPerSecond,
    exportWithFeedback,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside <AppProvider>.');
  }
  return value;
}
