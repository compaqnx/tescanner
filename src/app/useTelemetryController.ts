import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VLinkerBleClient, type BleDeviceInfo } from '../lib/ble/VLinkerBleClient';
import { Elm327Session } from '../lib/can/elm327Session';
import { derivePollTargets } from '../lib/can/pollPlan';
import { CanFrame, DecodedSignal } from '../lib/can/types';
import { decodeCanFrame } from '../lib/dbc/decodeCanFrame';
import { DbcDatabase } from '../lib/dbc/types';
import { loadVehicleDbc } from '../lib/dbc/dbcLoader';
import {
  buildAliasLookup,
  DEFAULT_VEHICLE_PROFILE_ID,
  getVehicleProfileById,
  VEHICLE_PROFILES,
  type VehicleProfileId,
} from '../lib/config/vehicleProfiles';
import { SessionStore } from '../lib/export/sessionStore';
import { exportSessionAsCsv } from '../lib/export/csv';

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

export function useTelemetryController() {
  const bleRef = useRef<VLinkerBleClient | null>(null);
  const elmRef = useRef<Elm327Session | null>(null);
  const storeRef = useRef<SessionStore | null>(null);
  const dbcRef = useRef<DbcDatabase | null>(null);

  const stopScanRef = useRef<(() => void) | null>(null);
  const latestMapRef = useRef<Map<string, SignalTile>>(new Map());
  const recentFramesRef = useRef<CanFrame[]>([]);
  const uiFlushTimeRef = useRef(0);

  const [status, setStatus] = useState<TelemetryStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [frameCount, setFrameCount] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
  const [signals, setSignals] = useState<SignalTile[]>([]);
  const [recentRawFrames, setRecentRawFrames] = useState<string[]>([]);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastExportUri, setLastExportUri] = useState<string | null>(null);
  const [selectedVehicleProfileId, setSelectedVehicleProfileId] =
    useState<VehicleProfileId>(DEFAULT_VEHICLE_PROFILE_ID);
  const [canFilterEnabled, setCanFilterEnabled] = useState(true);

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
    recentFramesRef.current = [];

    setSignals([]);
    setRecentRawFrames([]);

    if (resetCounters) {
      setFrameCount(0);
      setSignalCount(0);
    }
  }, []);

  const pushFrameForUi = useCallback(() => {
    const next = recentFramesRef.current.map((frame) => frame.rawLine).slice(0, 24);
    setRecentRawFrames(next);
  }, []);

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
        const knownCount = latestMapRef.current.size;

        if (!watched && !latestMapRef.current.has(signalKey) && knownCount >= 420) {
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

    const granted = await ble.requestPermissions();
    if (!granted) {
      setStatus('error');
      setError('Bluetooth permission was denied.');
      return;
    }

    await ble.waitForPoweredOn();

    stopScan();
    setDevices([]);
    setStatus('scanning');

    stopScanRef.current = ble.startScan(
      (device) => {
        setDevices((current) => {
          if (current.some((entry) => entry.id === device.id)) {
            return current;
          }

          return [...current, device].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
        });
      },
      {
        filterNames: ['VLINKER', 'VGATE', 'OBD', 'ELM'],
      },
    );
  }, [stopScan]);

  const connectToAdapter = useCallback(async (deviceId: string) => {
    const ble = bleRef.current;
    if (!ble) {
      return;
    }

    stopScan();
    setError(null);
    setStatus('connecting');

    try {
      await ble.connect(deviceId);

      const elm = new Elm327Session(ble);
      await elm.initializeAdapter();

      elmRef.current = elm;
      setSelectedDeviceId(deviceId);
      setStatus('connected');
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : String(connectError);
      setError(message);
      setStatus('error');
    }
  }, [stopScan]);

  const startStreaming = useCallback(async () => {
    const elm = elmRef.current;
    const dbc = dbcRef.current;
    const store = storeRef.current;

    if (!elm || !dbc || !store) {
      setStatus('error');
      setError('System not ready for streaming yet.');
      return;
    }

    setError(null);
    clearLiveSignalCache(true);

    const sessionId = await store.startSession();
    setActiveSessionId(sessionId);

    const onFrame = (frame: CanFrame) => {
      const processFrame = async () => {
        setFrameCount((current) => current + 1);

        recentFramesRef.current = [frame, ...recentFramesRef.current].slice(0, 24);
        pushFrameForUi();

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

    // Filtered monitoring requests only the ids this profile decodes, so the
    // adapter is not overwhelmed by the full bus. Raw monitor-all remains as an
    // opt-out for debugging or unusual buses.
    if (canFilterEnabled) {
      const targets = derivePollTargets(dbc, selectedVehicleProfile);
      await elm.startFilteredMonitoring(targets, onFrame);
    } else {
      await elm.startMonitoring(onFrame);
    }

    setStatus('streaming');
  }, [canFilterEnabled, clearLiveSignalCache, handleDecodedSignals, pushFrameForUi, selectedVehicleProfile]);

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
        dbcRef.current = await loadVehicleDbc(profileId);
        setSelectedVehicleProfileId(profileId);
        clearLiveSignalCache(true);
        setStatus('idle');
      } catch (switchError) {
        const message = switchError instanceof Error ? switchError.message : String(switchError);
        setError(message);
        setStatus('error');
      }
    },
    [clearLiveSignalCache, selectedVehicleProfileId, status],
  );

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

      try {
        dbcRef.current = await loadVehicleDbc(DEFAULT_VEHICLE_PROFILE_ID);
        if (mounted) {
          setStatus('idle');
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
    vehicleProfiles: VEHICLE_PROFILES,
    selectedVehicleProfileId,
    selectedVehicleProfileName: selectedVehicleProfile.name,
    selectedVehicleProfile,
    canFilterEnabled,
    setCanFilterEnabled,
    scanForAdapters,
    stopScan,
    connectToAdapter,
    disconnect,
    setVehicleProfile,
    startStreaming,
    stopStreaming,
    sendAtCommand,
    exportLatestSession,
  };
}
