import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VLinkerBleClient, type BleDeviceInfo } from '../lib/ble/VLinkerBleClient';
import { Elm327Session, type RawMonitorLine } from '../lib/can/elm327Session';
import {
  formatPayload,
  type RawCanCounters,
  type RawCanEntry,
  type RawCanIdStat,
} from '../lib/can/rawTraffic';
import { describePollTargets, PollTarget, PollTargetInfo, pollTargetServes, toPollTargets } from '../lib/can/pollPlan';
import { buildSystemSignalIndex, type SystemId } from '../lib/systems/systemCatalog';
import type { SessionSummary } from '../lib/export/sessionStore';
import { CanFrame, DecodedSignal } from '../lib/can/types';
import { decodeCanFrame } from '../lib/dbc/decodeCanFrame';
import { DbcDatabase } from '../lib/dbc/types';
import { loadVehicleDbc } from '../lib/dbc/dbcLoader';
import {
  buildAliasLookup,
  DEFAULT_VEHICLE_PROFILE_ID,
  getVehicleProfileById,
  normalizeProfileId,
  VEHICLE_PROFILES,
  type VehicleProfileId,
} from '../lib/config/vehicleProfiles';
import { loadVehicleProfileId, saveVehicleProfileId } from '../lib/settings/settingsStore';
import type { TeslaModelKey } from '../lib/vehicle/modelDetection';
import { VehicleFingerprintCollector } from '../lib/vehicle/vehicleFingerprint';
import { SessionStore } from '../lib/export/sessionStore';
import { exportSessionAsCsv } from '../lib/export/csv';

// Names that hint a device is an OBD adapter — used only to sort likely adapters
// to the top of the list, never to hide anything (the dongle often advertises no
// name during a scan, so excluding unnamed devices is why it never appeared).
const ADAPTER_NAME_HINTS = ['vlinker', 'vgate', 'obd', 'elm', 'stn', 'icar', 'veepeak', 'carista', 'scantool', 'can'];

function isLikelyAdapter(device: BleDeviceInfo): boolean {
  const haystack = `${device.name} ${device.localName ?? ''}`.toLowerCase();
  return ADAPTER_NAME_HINTS.some((hint) => haystack.includes(hint));
}

function compareDiscoveredDevices(a: BleDeviceInfo, b: BleDeviceInfo): number {
  const likelyA = isLikelyAdapter(a) ? 1 : 0;
  const likelyB = isLikelyAdapter(b) ? 1 : 0;
  if (likelyA !== likelyB) {
    return likelyB - likelyA;
  }
  return (b.rssi ?? -999) - (a.rssi ?? -999);
}

// Accepts an Android Bluetooth MAC in any punctuation (8C:08:79:AC:4C:F1,
// 8c0879ac4cf1, 8C-08-79-…) and returns the canonical colon form, or null when it
// is not 12 hex digits. Lets the user connect by the address shown in Android's
// Bluetooth settings when the dongle never appears in the scan.
function normalizeBleAddress(raw: string): string | null {
  const hex = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) {
    return null;
  }
  return hex.match(/.{2}/g)!.join(':');
}

export type TelemetryStatus =
  | 'booting'
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'error';

export interface SignalTile extends DecodedSignal {
  label: string;
  watched: boolean;
  updatedAt: number;
}

const UI_FLUSH_INTERVAL_MS = 250;
const LIVE_SIGNAL_CAP = 420;
// Raw CAN view: how many recent lines to keep and how often to re-render. The
// adapter can deliver hundreds of lines a second, so the UI never renders per line.
const RAW_ENTRY_CAP = 100;
const RAW_UI_FLUSH_MS = 250;

// Signals used by the EV system screens are kept even when the live cache is full.
const SYSTEM_SIGNAL_INDEX = buildSystemSignalIndex();

/**
 * Default selection: the lightweight core + HV set. Extra system-only messages
 * stay off until the user streams a specific system, so the adapter's refresh
 * cycle stays short (the Scan My Tesla "pick what to log" trade-off).
 */
// Listen-only capture right after connecting, used to identify the vehicle.
const IDENTIFY_LISTEN_MS = 3_000;
// Below this many distinct ids the capture is too thin to prune the poll plan.
const IDENTIFY_MIN_IDS_FOR_PRUNING = 10;

export interface DetectedVehicle {
  profileId: VehicleProfileId | null;
  model: TeslaModelKey | null;
  vin: string | null;
  /** Distinct CAN ids heard during identification. */
  idCount: number;
}

/** Profile used at start-up: the last one used (persisted), else the default. */
function initialProfileId(): VehicleProfileId {
  return normalizeProfileId(loadVehicleProfileId()) ?? DEFAULT_VEHICLE_PROFILE_ID;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultDisabledPollIds(catalog: PollTargetInfo[]): Set<number> {
  return new Set(catalog.filter((info) => info.category === 'system').map((info) => info.id));
}

export function useTelemetryController() {
  const bleRef = useRef<VLinkerBleClient | null>(null);
  const elmRef = useRef<Elm327Session | null>(null);
  const storeRef = useRef<SessionStore | null>(null);
  const dbcRef = useRef<DbcDatabase | null>(null);

  const stopScanRef = useRef<(() => void) | null>(null);
  const latestMapRef = useRef<Map<string, SignalTile>>(new Map());
  const uiFlushTimeRef = useRef(0);
  const rawEntriesRef = useRef<RawCanEntry[]>([]);
  const rawStatsRef = useRef<Map<number, RawCanIdStat>>(new Map());
  const rawSeqRef = useRef(0);
  const rawCountersRef = useRef<RawCanCounters>({ lines: 0, unparsed: 0 });
  const frameCountRef = useRef(0);
  const rawFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<TelemetryStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [frameCount, setFrameCount] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
  const [signals, setSignals] = useState<SignalTile[]>([]);
  const [recentRawFrames, setRecentRawFrames] = useState<RawCanEntry[]>([]);
  const [rawIdStats, setRawIdStats] = useState<RawCanIdStat[]>([]);
  const [rawCounters, setRawCounters] = useState<RawCanCounters>({ lines: 0, unparsed: 0 });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastExportUri, setLastExportUri] = useState<string | null>(null);
  const [selectedVehicleProfileId, setSelectedVehicleProfileId] =
    useState<VehicleProfileId>(initialProfileId);
  const [detectedVehicle, setDetectedVehicle] = useState<DetectedVehicle | null>(null);
  // Read by the connect flow, whose callback must not go stale on profile changes.
  const selectedProfileRef = useRef(selectedVehicleProfileId);
  selectedProfileRef.current = selectedVehicleProfileId;
  const [canFilterEnabled, setCanFilterEnabled] = useState(true);
  const [pollCatalog, setPollCatalog] = useState<PollTargetInfo[]>([]);
  const [disabledPollIds, setDisabledPollIds] = useState<Set<number>>(new Set());
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [connectionLog, setConnectionLog] = useState<string[]>([]);

  const appendLog = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString();
    setConnectionLog((current) => [`${stamp}  ${message}`, ...current].slice(0, 200));
  }, []);
  const appendLogRef = useRef(appendLog);
  appendLogRef.current = appendLog;
  const clearConnectionLog = useCallback(() => setConnectionLog([]), []);

  const selectedVehicleProfile = useMemo(
    () => getVehicleProfileById(selectedVehicleProfileId),
    [selectedVehicleProfileId],
  );

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const aliasLookup = useMemo(() => buildAliasLookup(selectedVehicleProfile), [selectedVehicleProfile]);

  const watchLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const alias of selectedVehicleProfile.aliases) {
      labels.set(alias.canonicalName, alias.label);
      for (const key of alias.aliases) {
        labels.set(key, alias.label);
      }
    }
    return labels;
  }, [selectedVehicleProfile]);

  const watchedSignals = useMemo(
    () => new Set(selectedVehicleProfile.watchSignals),
    [selectedVehicleProfile],
  );

  const clearLiveSignalCache = useCallback((resetCounters: boolean) => {
    latestMapRef.current.clear();
    rawEntriesRef.current = [];
    rawStatsRef.current.clear();
    rawCountersRef.current = { lines: 0, unparsed: 0 };
    if (rawFlushTimerRef.current) {
      clearTimeout(rawFlushTimerRef.current);
      rawFlushTimerRef.current = null;
    }

    setSignals([]);
    setRecentRawFrames([]);
    setRawIdStats([]);
    setRawCounters({ lines: 0, unparsed: 0 });

    if (resetCounters) {
      frameCountRef.current = 0;
      setFrameCount(0);
      setSignalCount(0);
    }
  }, []);

  const flushRawUi = useCallback(() => {
    rawFlushTimerRef.current = null;
    setRecentRawFrames(rawEntriesRef.current.slice());
    setRawIdStats(Array.from(rawStatsRef.current.values()).sort((a, b) => a.id - b.id));
    setRawCounters({ ...rawCountersRef.current });
    setFrameCount(frameCountRef.current);
  }, []);

  const scheduleRawFlush = useCallback(() => {
    if (!rawFlushTimerRef.current) {
      rawFlushTimerRef.current = setTimeout(flushRawUi, RAW_UI_FLUSH_MS);
    }
  }, [flushRawUi]);

  /**
   * Every line the adapter sends while monitoring — parsed frames and adapter
   * messages (BUFFER FULL, ?, CAN ERROR, ...) alike — so the Raw CAN view shows
   * what is really on the wire even when nothing decodes.
   */
  const handleRawLine = useCallback(
    ({ line, timestamp, frame }: RawMonitorLine) => {
      const dbc = dbcRef.current;
      const dataHex = frame ? formatPayload(frame.data) : null;
      const messageName = frame ? (dbc?.messages[frame.id]?.name ?? null) : null;

      rawSeqRef.current += 1;
      const entries = rawEntriesRef.current;
      entries.unshift({
        seq: rawSeqRef.current,
        timestamp,
        line,
        id: frame?.id ?? null,
        dataHex,
        messageName,
      });
      if (entries.length > RAW_ENTRY_CAP) {
        entries.length = RAW_ENTRY_CAP;
      }

      const counters = rawCountersRef.current;
      counters.lines += 1;
      if (!frame) {
        counters.unparsed += 1;
      } else if (dataHex !== null) {
        const previous = rawStatsRef.current.get(frame.id);
        rawStatsRef.current.set(frame.id, {
          id: frame.id,
          count: (previous?.count ?? 0) + 1,
          lastDataHex: dataHex,
          lastAt: timestamp,
          changed: previous ? previous.lastDataHex !== dataHex : false,
          messageName,
        });
      }

      scheduleRawFlush();
    },
    [scheduleRawFlush],
  );

  /**
   * Loads a profile's DBC and poll catalog and remembers the choice. Has no
   * status guards, so the connect flow can switch profiles after identifying the
   * car; user-initiated switches go through setVehicleProfile.
   */
  const applyProfile = useCallback(
    async (profileId: VehicleProfileId): Promise<PollTargetInfo[]> => {
      const nextDbc = await loadVehicleDbc(profileId);
      const nextCatalog = describePollTargets(nextDbc, getVehicleProfileById(profileId));
      dbcRef.current = nextDbc;
      setPollCatalog(nextCatalog);
      setDisabledPollIds(defaultDisabledPollIds(nextCatalog));
      setSelectedVehicleProfileId(profileId);
      saveVehicleProfileId(profileId);
      clearLiveSignalCache(true);
      return nextCatalog;
    },
    [clearLiveSignalCache],
  );

  /**
   * Listens to the bus for a few seconds (nothing is sent to the car), picks the
   * matching profile and, when the capture is rich enough, turns off polling of
   * message ids this bus never carries so the refresh cycle stays short.
   */
  const identifyVehicle = useCallback(
    async (elm: Elm327Session, currentProfileId: VehicleProfileId): Promise<void> => {
      appendLog('Listening to identify the vehicle…');
      const collector = new VehicleFingerprintCollector();

      try {
        await elm.startMonitoring((frame) => collector.add(frame));
        await delay(IDENTIFY_LISTEN_MS);
      } finally {
        await elm.stopMonitoring();
      }

      if (collector.distinctIds === 0) {
        appendLog('No CAN traffic heard (car asleep?). Keeping the selected vehicle profile.');
        setDetectedVehicle(null);
        return;
      }

      const familyDbcs = {} as Record<VehicleProfileId, DbcDatabase>;
      for (const profile of VEHICLE_PROFILES) {
        familyDbcs[profile.id] = await loadVehicleDbc(profile.id);
      }
      const fingerprint = collector.result(familyDbcs);
      const scoreText = VEHICLE_PROFILES.map((profile) => `${profile.name}: ${fingerprint.scores[profile.id]}`).join(', ');
      appendLog(
        `Heard ${fingerprint.seenIds.size} CAN ids (family-specific — ${scoreText})` +
          (fingerprint.vin ? `; VIN ${fingerprint.vin}` : '') +
          '.',
      );

      setDetectedVehicle({
        profileId: fingerprint.family,
        model: fingerprint.model,
        vin: fingerprint.vin,
        idCount: fingerprint.seenIds.size,
      });

      if (!fingerprint.family) {
        appendLog('Vehicle not identified with confidence. Keeping the selected vehicle profile.');
        return;
      }

      let catalog: PollTargetInfo[] | null = null;
      if (fingerprint.family !== currentProfileId) {
        catalog = await applyProfile(fingerprint.family);
        appendLog(`Vehicle identified — switched profile to ${getVehicleProfileById(fingerprint.family).name}.`);
      } else {
        appendLog(`Vehicle identified — ${getVehicleProfileById(fingerprint.family).name} profile already selected.`);
      }

      if (fingerprint.seenIds.size >= IDENTIFY_MIN_IDS_FOR_PRUNING) {
        const source = catalog ?? describePollTargets(familyDbcs[fingerprint.family], getVehicleProfileById(fingerprint.family));
        const absent = source.filter((info) => !fingerprint.seenIds.has(info.id)).map((info) => info.id);
        if (absent.length > 0) {
          setDisabledPollIds((current) => new Set([...current, ...absent]));
          appendLog(`${absent.length} message group(s) not on this bus were turned off (re-enable in Setup).`);
        }
      }
    },
    [appendLog, applyProfile],
  );

  const flushUiSignals = useCallback(() => {
    const ordered = Array.from(latestMapRef.current.values()).sort((a, b) => {
      if (a.watched !== b.watched) {
        return a.watched ? -1 : 1;
      }
      return b.updatedAt - a.updatedAt;
    });

    setSignals(ordered);
  }, []);

  const maybeFlushUiSignals = useCallback(() => {
    const now = Date.now();
    if (now - uiFlushTimeRef.current < UI_FLUSH_INTERVAL_MS) {
      return;
    }

    uiFlushTimeRef.current = now;
    flushUiSignals();
  }, [flushUiSignals]);

  const handleDecodedSignals = useCallback(
    async (frame: CanFrame, decodedSignals: DecodedSignal[]) => {
      if (decodedSignals.length === 0) {
        return;
      }

      setSignalCount((current) => current + decodedSignals.length);
      await storeRef.current?.appendSignals(frame.timestamp, decodedSignals);

      for (const signal of decodedSignals) {
        const resolution = aliasLookup.get(signal.signalName) ?? aliasLookup.get(signal.signalName.toLowerCase());
        const canonicalName = resolution?.canonicalName ?? signal.signalName;
        const signalKey = resolution ? `canonical.${canonicalName}` : signal.key;
        const watched = watchedSignals.has(canonicalName);
        const pinned =
          watched || SYSTEM_SIGNAL_INDEX.has(canonicalName) || SYSTEM_SIGNAL_INDEX.has(signal.signalName);
        const knownCount = latestMapRef.current.size;

        if (!pinned && !latestMapRef.current.has(signalKey) && knownCount >= LIVE_SIGNAL_CAP) {
          continue;
        }

        latestMapRef.current.set(signalKey, {
          ...signal,
          key: signalKey,
          signalName: canonicalName,
          watched,
          label: resolution?.label ?? watchLabels.get(signal.signalName) ?? signal.signalName,
          updatedAt: frame.timestamp,
        });
      }

      maybeFlushUiSignals();
    },
    [aliasLookup, maybeFlushUiSignals, watchLabels, watchedSignals],
  );

  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;

    if (status === 'scanning') {
      setStatus('idle');
    }
  }, [status]);

  const stopStreaming = useCallback(async () => {
    const elm = elmRef.current;
    if (elm) {
      await elm.stopMonitoring();
    }

    await storeRef.current?.stopSession();
    setActiveSessionId(null);
    setStreamStartedAt(null);

    try {
      const sessions = await storeRef.current?.getRecentSessions(20);
      if (sessions) {
        setRecentSessions(sessions);
      }
    } catch {
      // Session list is best-effort; the stream itself already stopped.
    }

    if (bleRef.current?.getConnectionState().connected) {
      setStatus('connected');
    } else {
      setStatus('idle');
    }
  }, []);

  const disconnect = useCallback(async () => {
    await stopStreaming();

    await elmRef.current?.dispose();
    elmRef.current = null;

    await bleRef.current?.disconnect();
    setSelectedDeviceId(null);
    setStatus('idle');
  }, [stopStreaming]);

  const scanForAdapters = useCallback(async () => {
    const ble = bleRef.current;
    if (!ble) {
      return;
    }

    setError(null);
    appendLog('Requesting Bluetooth permission…');

    const granted = await ble.requestPermissions();
    if (!granted) {
      appendLog('Bluetooth permission denied.');
      setStatus('error');
      setError('Bluetooth permission was denied.');
      return;
    }

    appendLog('Waiting for Bluetooth to power on…');
    await ble.waitForPoweredOn();

    stopScan();
    setDevices([]);
    setStatus('scanning');

    // A dongle already connected/bonded at the OS level does not advertise, so it
    // never shows up in the live scan. List those first (with their OS-known name)
    // so a Classic-paired vLinker still appears as something the user can tap.
    const known = await ble.listKnownDevices();
    if (known.length > 0) {
      appendLog(`${known.length} already-known device(s) added from the system.`);
      setDevices((current) => {
        const byId = new Map<string, BleDeviceInfo>(current.map((entry) => [entry.id, entry] as const));
        for (const device of known) {
          byId.set(device.id, device);
        }
        return Array.from(byId.values()).sort(compareDiscoveredDevices);
      });
    }

    stopScanRef.current = ble.startScan(
      (device) => {
        // Upsert: replace any existing entry for this id so a late-arriving name
        // or RSSI update is reflected, then keep likely adapters on top.
        setDevices((current) => {
          const others = current.filter((entry) => entry.id !== device.id);
          return [...others, device].sort(compareDiscoveredDevices);
        });
      },
      {
        // Only used to sort likely adapters first — no device is excluded.
        filterNames: ADAPTER_NAME_HINTS,
        onScanComplete: (count) => {
          appendLog(`Scan complete — ${count} device(s) found.`);
          // The scan timed out on its own; return the UI to idle if still scanning.
          setStatus((current) => (current === 'scanning' ? 'idle' : current));
        },
      },
    );
  }, [appendLog, stopScan]);

  const connectToAdapter = useCallback(
    async (deviceId: string) => {
      const ble = bleRef.current;
      if (!ble) {
        return;
      }

      stopScan();
      setError(null);
      setStatus('connecting');
      appendLog(`Connecting to ${deviceId}…`);

      try {
        const state = await ble.connect(deviceId);
        const resolvedName = state.deviceName ?? deviceId;
        appendLog(`Connected to ${resolvedName}. Initializing adapter…`);

        // The real name is only known once connected (scan packets are often
        // nameless). Record it so the list shows "vLinker FS …" instead of
        // "Unknown device", and so a manually-entered address appears at all.
        setDevices((current) => {
          const existing = current.find((entry) => entry.id === deviceId);
          const merged: BleDeviceInfo = {
            id: deviceId,
            name: resolvedName,
            localName: existing?.localName,
            rssi: existing?.rssi,
          };
          return [...current.filter((entry) => entry.id !== deviceId), merged].sort(compareDiscoveredDevices);
        });

        const elm = new Elm327Session(ble);
        elm.setRawLineListener(handleRawLine);
        await elm.initializeAdapter();

        elmRef.current = elm;
        setSelectedDeviceId(deviceId);

        try {
          await identifyVehicle(elm, selectedProfileRef.current);
        } catch (identifyError) {
          const message = identifyError instanceof Error ? identifyError.message : String(identifyError);
          appendLog(`Vehicle identification skipped: ${message}`);
        }

        setStatus('connected');
        appendLog('Adapter initialized — ready to stream.');
      } catch (connectError) {
        const message = connectError instanceof Error ? connectError.message : String(connectError);
        appendLog(`Connection failed: ${message}`);
        setError(message);
        setStatus('error');
      }
    },
    [appendLog, handleRawLine, identifyVehicle, stopScan],
  );

  /**
   * Connect straight to a Bluetooth address the user typed (the one shown in
   * Android's Bluetooth settings), skipping the scan. On Android a bonded dual-mode
   * dongle can be reached by its MAC even when it never advertises — the usual
   * reason a paired vLinker FS never shows up in the list.
   */
  const connectToAddress = useCallback(
    async (rawAddress: string) => {
      const address = normalizeBleAddress(rawAddress);
      if (!address) {
        appendLog(`"${rawAddress.trim()}" is not a valid Bluetooth address (expected 12 hex digits).`);
        setError('Enter a Bluetooth address like 8C:08:79:AC:4C:F1.');
        setStatus('error');
        return;
      }
      appendLog(`Manual connect to ${address} (bypassing scan)…`);
      await connectToAdapter(address);
    },
    [appendLog, connectToAdapter],
  );

  const startStreaming = useCallback(async (disabledOverride?: Set<number>) => {
    const disabled = disabledOverride ?? disabledPollIds;
    const elm = elmRef.current;
    const dbc = dbcRef.current;
    const store = storeRef.current;

    if (!elm || !dbc || !store) {
      setStatus('error');
      setError('System not ready for streaming yet.');
      return;
    }

    // Resolve the poll targets before opening a session so a bad selection does
    // not leave a half-started session behind.
    let targets: PollTarget[] | null = null;
    if (canFilterEnabled) {
      const catalog = pollCatalog.length > 0 ? pollCatalog : describePollTargets(dbc, selectedVehicleProfile);
      targets = toPollTargets(catalog.filter((info) => !disabled.has(info.id)));
      if (targets.length === 0) {
        setError('Select at least one signal group to stream.');
        return;
      }
    }

    setError(null);
    clearLiveSignalCache(true);

    const sessionId = await store.startSession();
    setActiveSessionId(sessionId);

    const onFrame = (frame: CanFrame) => {
      const processFrame = async () => {
        // Counted here, rendered by the throttled raw-traffic flush.
        frameCountRef.current += 1;
        scheduleRawFlush();

        await store.appendFrame(frame);

        const decoded = decodeCanFrame(frame, dbc);
        await handleDecodedSignals(frame, decoded);
      };

      void processFrame().catch((streamError) => {
        const message = streamError instanceof Error ? streamError.message : String(streamError);
        setError(message);
        setStatus('error');
      });
    };

    // Filtered monitoring requests only the selected ids, so the adapter is not
    // overwhelmed by the full bus. Raw monitor-all remains as an opt-out.
    if (targets) {
      await elm.startFilteredMonitoring(targets, onFrame);
    } else {
      await elm.startMonitoring(onFrame);
    }

    setStreamStartedAt(Date.now());
    setStatus('streaming');
  }, [
    canFilterEnabled,
    clearLiveSignalCache,
    disabledPollIds,
    handleDecodedSignals,
    pollCatalog,
    scheduleRawFlush,
    selectedVehicleProfile,
  ]);

  const setVehicleProfile = useCallback(
    async (profileId: VehicleProfileId): Promise<void> => {
      if (profileId === selectedVehicleProfileId) {
        return;
      }

      if (status === 'connecting' || status === 'connected' || status === 'streaming' || status === 'scanning') {
        setError('Switch vehicle profile while idle. Disconnect and stop streaming first.');
        return;
      }

      setError(null);
      setStatus('booting');

      try {
        await applyProfile(profileId);
        setDetectedVehicle(null);
        setStatus('idle');
      } catch (switchError) {
        const message = switchError instanceof Error ? switchError.message : String(switchError);
        setError(message);
        setStatus('error');
      }
    },
    [applyProfile, selectedVehicleProfileId, status],
  );

  const togglePollId = useCallback((id: number) => {
    setDisabledPollIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const setAllPollEnabled = useCallback(
    (enabled: boolean) => {
      setDisabledPollIds(enabled ? new Set<number>() : new Set(pollCatalog.map((info) => info.id)));
    },
    [pollCatalog],
  );

  /** Restore the default lightweight selection (core + HV). */
  const resetPollSelection = useCallback(() => {
    setDisabledPollIds(defaultDisabledPollIds(pollCatalog));
  }, [pollCatalog]);

  /** Enable or disable every message that feeds one EV system's screen. */
  const setSystemPollEnabled = useCallback(
    (systemId: SystemId, enabled: boolean) => {
      setDisabledPollIds((current) => {
        const next = new Set(current);
        for (const info of pollCatalog) {
          if (!pollTargetServes(info, systemId)) {
            continue;
          }
          if (enabled) {
            next.delete(info.id);
          } else {
            next.add(info.id);
          }
        }
        return next;
      });
    },
    [pollCatalog],
  );

  /**
   * Stream only what one system needs (fastest refresh for that screen).
   * Restarts the stream when it is already running so the new filter applies.
   */
  const focusSystem = useCallback(
    async (systemId: SystemId) => {
      // Nothing in this profile feeds the system: keep the current stream as is.
      if (!pollCatalog.some((info) => pollTargetServes(info, systemId))) {
        return;
      }
      const next = new Set(
        pollCatalog.filter((info) => !pollTargetServes(info, systemId)).map((info) => info.id),
      );
      setDisabledPollIds(next);

      if (status === 'streaming') {
        await stopStreaming();
        await startStreaming(next);
      } else if (status === 'connected') {
        await startStreaming(next);
      }
    },
    [pollCatalog, startStreaming, status, stopStreaming],
  );

  const refreshSessions = useCallback(async () => {
    const sessions = await storeRef.current?.getRecentSessions(20);
    if (sessions) {
      setRecentSessions(sessions);
    }
  }, []);

  const exportSession = useCallback(async (sessionId: string): Promise<string | null> => {
    const store = storeRef.current;
    if (!store) {
      return null;
    }
    const uri = await exportSessionAsCsv(store, sessionId);
    setLastExportUri(uri);
    return uri;
  }, []);

  const sendAtCommand = useCallback(async (command: string): Promise<string[]> => {
    const elm = elmRef.current;
    if (!elm) {
      throw new Error('Adapter is not connected.');
    }

    return elm.sendCommand(command);
  }, []);

  const exportLatestSession = useCallback(async (): Promise<string | null> => {
    const store = storeRef.current;
    if (!store) {
      return null;
    }

    let sessionId = activeSessionId;
    if (!sessionId) {
      const sessions = await store.getRecentSessions(1);
      sessionId = sessions[0]?.sessionId ?? null;
    }

    if (!sessionId) {
      return null;
    }

    const uri = await exportSessionAsCsv(store, sessionId);
    setLastExportUri(uri);
    return uri;
  }, [activeSessionId]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const ble = new VLinkerBleClient();
      const store = new SessionStore();

      bleRef.current = ble;
      storeRef.current = store;
      ble.setLogger((message) => appendLogRef.current(message));

      try {
        // Start with the profile used last time (the state was initialised from it).
        const bootProfileId = selectedProfileRef.current;
        const bootDbc = await loadVehicleDbc(bootProfileId);
        dbcRef.current = bootDbc;
        if (mounted) {
          const bootCatalog = describePollTargets(bootDbc, getVehicleProfileById(bootProfileId));
          setPollCatalog(bootCatalog);
          setDisabledPollIds(defaultDisabledPollIds(bootCatalog));
          setStatus('idle');
          store
            .getRecentSessions(20)
            .then((sessions) => {
              if (mounted) {
                setRecentSessions(sessions);
              }
            })
            .catch(() => undefined);
        }
      } catch (bootstrapError) {
        if (!mounted) {
          return;
        }

        const message = bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError);
        setError(message);
        setStatus('error');
      }
    };

    bootstrap().catch((bootstrapError) => {
      if (!mounted) {
        return;
      }

      const message = bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError);
      setError(message);
      setStatus('error');
    });

    return () => {
      mounted = false;

      if (rawFlushTimerRef.current) {
        clearTimeout(rawFlushTimerRef.current);
        rawFlushTimerRef.current = null;
      }

      stopScanRef.current?.();
      stopScanRef.current = null;

      const dispose = async () => {
        try {
          await elmRef.current?.dispose();
        } catch {
          // ignore
        }

        try {
          await bleRef.current?.destroy();
        } catch {
          // ignore
        }
      };

      void dispose();
    };
  }, []);

  return {
    status,
    error,
    devices,
    selectedDeviceId,
    selectedDevice,
    frameCount,
    signalCount,
    signals,
    activeSessionId,
    lastExportUri,
    recentRawFrames,
    rawIdStats,
    rawCounters,
    vehicleProfiles: VEHICLE_PROFILES,
    selectedVehicleProfileId,
    selectedVehicleProfileName: selectedVehicleProfile.name,
    selectedVehicleProfile,
    detectedVehicle,
    canFilterEnabled,
    setCanFilterEnabled,
    pollCatalog,
    disabledPollIds,
    togglePollId,
    setAllPollEnabled,
    resetPollSelection,
    setSystemPollEnabled,
    focusSystem,
    recentSessions,
    refreshSessions,
    exportSession,
    streamStartedAt,
    connectionLog,
    clearConnectionLog,
    scanForAdapters,
    stopScan,
    connectToAdapter,
    connectToAddress,
    disconnect,
    setVehicleProfile,
    startStreaming,
    stopStreaming,
    sendAtCommand,
    exportLatestSession,
  };
}
