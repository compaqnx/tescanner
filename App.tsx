import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SignalTile, TelemetryStatus, useTelemetryController } from './src/app/useTelemetryController';
import { pickHvAccessorySignals, pickHvCellSignals } from './src/lib/hv/hvSignalCatalog';
import { LocaleCode, localizeTelemetryError, TranslationKey, translate } from './src/lib/i18n/localization';

type AppScreenId =
  | 'dashboard'
  | 'hvBattery'
  | 'signals'
  | 'adapter'
  | 'console'
  | 'errors'
  | 'settings';
type HvViewMode = 'grid' | 'bars';
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type TeslaModelKey = 'model3' | 'modely' | 'models' | 'modelx';

interface DrawerItem {
  id: AppScreenId;
  labelKey: TranslationKey;
  icon: IconName;
}

interface DetectedTeslaModel {
  key: TeslaModelKey;
  nameKey: TranslationKey;
  source: 'fallback' | 'profile' | 'device-name' | 'signal';
}

interface StoredError {
  id: number;
  message: string;
  createdAt: number;
}

interface DashboardWidget {
  key: string;
  labelKey: TranslationKey;
  value: string;
  unit: string;
  statusText?: string;
  accent?: 'neon' | 'danger';
}

const HV_CELLS_PER_PAGE = 12;
const DRAWER_WIDTH = 286;
const NEON = '#C7FF19';

const TESLA_MODEL_IMAGES: Record<TeslaModelKey, number> = {
  model3: require('./assets/vehicles/tesla_model3.png'),
  modely: require('./assets/vehicles/tesla_modely.png'),
  models: require('./assets/vehicles/tesla_models.png'),
  modelx: require('./assets/vehicles/tesla_modelx.png'),
};

const DRAWER_ITEMS: DrawerItem[] = [
  { id: 'dashboard', labelKey: 'tabDashboard', icon: 'view-dashboard-outline' },
  { id: 'hvBattery', labelKey: 'tabHvBattery', icon: 'car-battery' },
  { id: 'signals', labelKey: 'tabSignals', icon: 'chart-line' },
  { id: 'adapter', labelKey: 'tabAdapter', icon: 'bluetooth-connect' },
  { id: 'console', labelKey: 'tabConsole', icon: 'console-line' },
  { id: 'errors', labelKey: 'tabErrors', icon: 'alert-circle-outline' },
  { id: 'settings', labelKey: 'tabSettings', icon: 'cog-outline' },
];

function statusKey(status: TelemetryStatus): TranslationKey {
  switch (status) {
    case 'booting':
      return 'statusBooting';
    case 'idle':
      return 'statusIdle';
    case 'scanning':
      return 'statusScanning';
    case 'connecting':
      return 'statusConnecting';
    case 'connected':
      return 'statusConnected';
    case 'streaming':
      return 'statusStreaming';
    case 'error':
      return 'statusError';
    default:
      return 'genericUnknown';
  }
}

function profileDisplayName(locale: LocaleCode, profileId: string): string {
  switch (profileId) {
    case 'model3y':
      return translate(locale, 'profileModel3yName');
    case 'modelsx_2015_2021':
      return translate(locale, 'profileModelsxName');
    default:
      return profileId;
  }
}

function profileDisplayDescription(locale: LocaleCode, profileId: string, fallback: string): string {
  switch (profileId) {
    case 'model3y':
      return translate(locale, 'profileModel3yDesc');
    case 'modelsx_2015_2021':
      return translate(locale, 'profileModelsxDesc');
    default:
      return fallback;
  }
}

function toFixedMaybe(value: number, digits: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

function mapBySignalName(signals: SignalTile[]): Map<string, SignalTile> {
  const map = new Map<string, SignalTile>();
  for (const signal of signals) {
    const existing = map.get(signal.signalName);
    if (!existing || signal.updatedAt >= existing.updatedAt) {
      map.set(signal.signalName, signal);
    }
  }
  return map;
}

function findFirstSignal(signalIndex: Map<string, SignalTile>, candidates: string[]): SignalTile | null {
  for (const key of candidates) {
    const match = signalIndex.get(key);
    if (match) {
      return match;
    }
  }
  return null;
}

function detectTeslaModel(
  connected: boolean,
  selectedProfileId: string,
  selectedDeviceName: string | null,
  signalIndex: Map<string, SignalTile>,
): DetectedTeslaModel {
  if (!connected) {
    return {
      key: 'model3',
      nameKey: 'modelNameUnknown',
      source: 'fallback',
    };
  }

  const deviceHint = (selectedDeviceName ?? '').toLowerCase();
  if (deviceHint.includes('model x') || deviceHint.includes('tesla x')) {
    return { key: 'modelx', nameKey: 'modelNameModelX', source: 'device-name' };
  }
  if (deviceHint.includes('model s') || deviceHint.includes('tesla s')) {
    return { key: 'models', nameKey: 'modelNameModelS', source: 'device-name' };
  }
  if (deviceHint.includes('model y') || deviceHint.includes('tesla y')) {
    return { key: 'modely', nameKey: 'modelNameModelY', source: 'device-name' };
  }
  if (deviceHint.includes('model 3') || deviceHint.includes('tesla 3')) {
    return { key: 'model3', nameKey: 'modelNameModel3', source: 'device-name' };
  }

  if (selectedProfileId === 'modelsx_2015_2021') {
    const wheelSignal = signalIndex.get('DI_tireTypeConfig');
    if (wheelSignal && wheelSignal.value > 1) {
      return { key: 'modelx', nameKey: 'modelNameModelX', source: 'signal' };
    }

    return { key: 'models', nameKey: 'modelNameModelSx', source: 'profile' };
  }

  if (selectedProfileId === 'model3y') {
    // Pack energy cannot reliably tell a Model 3 Long Range (~75-82 kWh) from a
    // Model Y, so this profile shows a combined label unless the adapter's device
    // name (handled above) reveals the specific model.
    return { key: 'model3', nameKey: 'modelNameModel3y', source: 'profile' };
  }

  return {
    key: 'model3',
    nameKey: 'modelNameModel3',
    source: 'fallback',
  };
}

function formatErrorTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const metricColumns = isLandscape ? (windowWidth >= 760 ? 4 : 3) : 2;
  const contentWidth = windowWidth - 24;
  const metricGap = 8;
  const metricCardWidth =
    (contentWidth - metricGap * (metricColumns - 1)) / metricColumns;
  const hvColumns = isLandscape ? (windowWidth >= 760 ? 4 : 3) : 2;
  const hvCellWidth =
    (contentWidth - metricGap * (hvColumns - 1)) / hvColumns;
  const profileColumns = isLandscape ? (windowWidth >= 760 ? 4 : 3) : 2;
  const profileCardWidth =
    (contentWidth - metricGap * (profileColumns - 1) - 24) / profileColumns;

  const {
    status,
    error,
    devices,
    selectedDevice,
    frameCount,
    signalCount,
    signals,
    recentRawFrames,
    vehicleProfiles,
    selectedVehicleProfileId,
    scanForAdapters,
    connectToAdapter,
    disconnect,
    setVehicleProfile,
    startStreaming,
    stopStreaming,
    sendAtCommand,
    exportLatestSession,
    lastExportUri,
  } = useTelemetryController();

  const [locale, setLocale] = useState<LocaleCode>('en');
  const [screenStack, setScreenStack] = useState<AppScreenId[]>(['dashboard']);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [hvViewMode, setHvViewMode] = useState<HvViewMode>('grid');
  const [hvPageIndex, setHvPageIndex] = useState(0);
  const [signalFilter, setSignalFilter] = useState('');
  const [commandInput, setCommandInput] = useState('ATI');
  const [commandOutput, setCommandOutput] = useState<string[]>([]);
  const [commandBusy, setCommandBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [storedErrors, setStoredErrors] = useState<StoredError[]>([]);

  const drawerTranslateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const drawerBackdropOpacity = useRef(new Animated.Value(0)).current;
  const previousErrorRef = useRef<string | null>(null);
  const errorSeqRef = useRef(0);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const activeScreenId = screenStack[screenStack.length - 1] ?? 'dashboard';

  const openDrawer = useCallback(() => {
    if (drawerVisible) {
      return;
    }

    setDrawerVisible(true);
    Animated.parallel([
      Animated.timing(drawerTranslateX, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(drawerBackdropOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [drawerBackdropOpacity, drawerTranslateX, drawerVisible]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerTranslateX, {
        toValue: -DRAWER_WIDTH,
        duration: 210,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(drawerBackdropOpacity, {
        toValue: 0,
        duration: 210,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setDrawerVisible(false);
      }
    });
  }, [drawerBackdropOpacity, drawerTranslateX]);

  const navigateToScreen = useCallback(
    (screen: AppScreenId) => {
      setScreenStack((current) => {
        const latest = current[current.length - 1];
        if (latest === screen) {
          return current;
        }
        return [...current, screen];
      });
      closeDrawer();
    },
    [closeDrawer],
  );

  const handleBackIntent = useCallback(() => {
    if (drawerVisible) {
      closeDrawer();
      return true;
    }

    if (screenStack.length > 1) {
      setScreenStack((current) => current.slice(0, current.length - 1));
      return true;
    }

    Alert.alert(t('exitAppTitle'), t('exitAppMessage'), [
      {
        text: t('exitAppCancel'),
        style: 'cancel',
      },
      {
        text: t('exitAppConfirm'),
        style: 'destructive',
        onPress: () => BackHandler.exitApp(),
      },
    ]);

    return true;
  }, [closeDrawer, drawerVisible, screenStack.length, t]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const listener = BackHandler.addEventListener('hardwareBackPress', handleBackIntent);
    return () => {
      listener.remove();
    };
  }, [handleBackIntent]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const horizontalSwipe = gestureState.dx > 18 && Math.abs(gestureState.dy) < 26;
          if (!horizontalSwipe) {
            return false;
          }

          if (drawerVisible) {
            return true;
          }

          return gestureState.moveX < 26 || screenStack.length > 1;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (drawerVisible && gestureState.dx < -56) {
            closeDrawer();
            return;
          }

          if (!drawerVisible && gestureState.moveX < 36 && gestureState.dx > 82) {
            openDrawer();
            return;
          }

          if (!drawerVisible && screenStack.length > 1 && gestureState.dx > 92) {
            setScreenStack((current) => current.slice(0, current.length - 1));
          }
        },
      }),
    [closeDrawer, drawerVisible, openDrawer, screenStack.length],
  );

  const watchedSignals = useMemo(() => signals.filter((signal) => signal.watched), [signals]);
  const additionalSignals = useMemo(() => signals.filter((signal) => !signal.watched), [signals]);

  const filteredSignalRows = useMemo(() => {
    const needle = signalFilter.trim().toLowerCase();
    if (!needle) {
      return additionalSignals.slice(0, 150);
    }

    return additionalSignals
      .filter((signal) => {
        const haystack = `${signal.signalName} ${signal.label} ${signal.messageName}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 150);
  }, [additionalSignals, signalFilter]);

  const hvCellSignals = useMemo(() => pickHvCellSignals(signals), [signals]);
  const hvPageCount = useMemo(
    () => Math.max(1, Math.ceil(hvCellSignals.length / HV_CELLS_PER_PAGE)),
    [hvCellSignals.length],
  );

  useEffect(() => {
    if (hvPageIndex > hvPageCount - 1) {
      setHvPageIndex(hvPageCount - 1);
    }
  }, [hvPageCount, hvPageIndex]);

  const hvPageCells = useMemo(() => {
    const start = hvPageIndex * HV_CELLS_PER_PAGE;
    return hvCellSignals.slice(start, start + HV_CELLS_PER_PAGE);
  }, [hvCellSignals, hvPageIndex]);

  const hvMin = useMemo(() => {
    if (hvPageCells.length === 0) {
      return null;
    }
    return Math.min(...hvPageCells.map((cell) => cell.value));
  }, [hvPageCells]);

  const hvMax = useMemo(() => {
    if (hvPageCells.length === 0) {
      return null;
    }
    return Math.max(...hvPageCells.map((cell) => cell.value));
  }, [hvPageCells]);

  const hvDelta = useMemo(() => {
    if (hvMin === null || hvMax === null) {
      return null;
    }
    return hvMax - hvMin;
  }, [hvMax, hvMin]);

  const hvAccessorySignals = useMemo(() => pickHvAccessorySignals(signals), [signals]);

  const localizedError = useMemo(() => localizeTelemetryError(locale, error), [error, locale]);

  useEffect(() => {
    if (localizedError) {
      if (previousErrorRef.current !== localizedError) {
        const now = Date.now();
        const id = (errorSeqRef.current += 1);
        setStoredErrors((current) => [{ id, message: localizedError, createdAt: now }, ...current].slice(0, 80));
      }
      previousErrorRef.current = localizedError;
      return;
    }

    previousErrorRef.current = null;
  }, [localizedError]);

  const isConnected = status === 'connected' || status === 'streaming';
  const isBusy = status === 'booting' || status === 'connecting';

  const signalIndex = useMemo(() => mapBySignalName(signals), [signals]);

  const modelDetected = useMemo(
    () => detectTeslaModel(isConnected, selectedVehicleProfileId, selectedDevice?.name ?? null, signalIndex),
    [isConnected, selectedVehicleProfileId, selectedDevice?.name, signalIndex],
  );

  const statusChipColor =
    status === 'streaming'
      ? '#20D69A'
      : status === 'connected'
        ? '#67B7FF'
        : status === 'error'
          ? '#FF7E7E'
          : '#F5B66A';

  const packVoltageSignal = findFirstSignal(signalIndex, ['packVoltage', 'BMS_packVoltage', 'HVP_dcLinkVoltageFiltered']);
  const packCurrentSignal = findFirstSignal(signalIndex, ['packCurrent', 'BMS_packCurrent', 'BMS_batteryCurrent']);
  const hvPowerSignal = findFirstSignal(signalIndex, ['hvPower', 'drivePower', 'DI_power']);
  const idealRangeSignal = findFirstSignal(signalIndex, ['idealRange', 'UI_idealRange', 'UI_Range']);
  const vehicleSpeedSignal = findFirstSignal(signalIndex, ['vehicleSpeed', 'DI_speed', 'DI_vehicleSpeed']);
  const batterySocSignal = findFirstSignal(signalIndex, ['batterySocUi', 'batterySocReal', 'UI_SOC']);
  const battery12vSignal = findFirstSignal(signalIndex, [
    'UI_12vBatteryVoltage',
    'VCFRONT_lowVoltBatteryVoltage',
    'BMS_lowVoltageBattery',
    'lowVoltageBatteryVoltage',
  ]);
  const battery16vSignal = findFirstSignal(signalIndex, [
    'BMS_16vSupplyVoltage',
    'UI_16vBatteryVoltage',
    'VCFRONT_highVoltAccessoryVoltage',
  ]);

  const voltageStateLabel = useCallback(
    (value: number | undefined, lowThreshold: number, highThreshold: number): string => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return t('statusNoData');
      }
      if (value < lowThreshold) {
        return t('statusLow');
      }
      if (value > highThreshold) {
        return t('statusHigh');
      }
      return t('statusOk');
    },
    [t],
  );

  const dashboardWidgets = useMemo<DashboardWidget[]>(
    () => [
      {
        key: 'pack-voltage',
        labelKey: 'dashboardWidgetPackVoltage',
        value: toFixedMaybe(packVoltageSignal?.value ?? Number.NaN, 0),
        unit: 'V',
      },
      {
        key: 'hv-power',
        labelKey: 'dashboardWidgetHvPower',
        value: toFixedMaybe(hvPowerSignal?.value ?? Number.NaN, 2),
        unit: 'kW',
        accent: 'neon',
      },
      {
        key: 'pack-current',
        labelKey: 'dashboardWidgetPackCurrent',
        value: toFixedMaybe(packCurrentSignal?.value ?? Number.NaN, 2),
        unit: 'A',
      },
      {
        key: 'ideal-range',
        labelKey: 'dashboardWidgetIdealRange',
        value: toFixedMaybe(idealRangeSignal?.value ?? Number.NaN, 1),
        unit: 'km',
      },
      {
        key: 'system-12v',
        labelKey: 'dashboardWidgetSystem12v',
        value: toFixedMaybe(battery12vSignal?.value ?? Number.NaN, 2),
        unit: 'V',
        statusText: voltageStateLabel(battery12vSignal?.value, 11.4, 14.9),
      },
      {
        key: 'system-16v',
        labelKey: 'dashboardWidgetSystem16v',
        value: toFixedMaybe(battery16vSignal?.value ?? Number.NaN, 2),
        unit: 'V',
        statusText: voltageStateLabel(battery16vSignal?.value, 14.8, 17.2),
      },
      {
        key: 'speed',
        labelKey: 'dashboardWidgetVehicleSpeed',
        value: toFixedMaybe(vehicleSpeedSignal?.value ?? Number.NaN, 2),
        unit: 'km/h',
      },
      {
        key: 'soc',
        labelKey: 'dashboardWidgetBatterySoc',
        value: toFixedMaybe(batterySocSignal?.value ?? Number.NaN, 1),
        unit: '%',
      },
    ],
    [
      battery12vSignal?.value,
      battery16vSignal?.value,
      batterySocSignal?.value,
      hvPowerSignal?.value,
      idealRangeSignal?.value,
      packCurrentSignal?.value,
      packVoltageSignal?.value,
      vehicleSpeedSignal?.value,
      voltageStateLabel,
    ],
  );

  const runAction = async (name: string, action: () => Promise<void>) => {
    setActionBusy(name);
    try {
      await action();
    } catch {
      // Errors are surfaced through controller state.
    } finally {
      setActionBusy(null);
    }
  };

  const handleCommand = async () => {
    if (!commandInput.trim()) {
      return;
    }

    setCommandBusy(true);
    setCommandOutput([]);

    try {
      const lines = await sendAtCommand(commandInput.trim());
      setCommandOutput(lines.length > 0 ? lines : [t('commandEmptyResponse')]);
    } catch (commandError) {
      const message = commandError instanceof Error ? commandError.message : String(commandError);
      const localizedMessage = localizeTelemetryError(locale, message) ?? message;
      setCommandOutput([`${t('commandErrorPrefix')}: ${localizedMessage}`]);
    } finally {
      setCommandBusy(false);
    }
  };

  const handleExport = async () => {
    setActionBusy('export');
    try {
      const uri = await exportLatestSession();
      if (!uri) {
        Alert.alert(t('exportNoDataTitle'), t('exportNoData'));
      }
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : String(exportError);
      Alert.alert(t('exportNoDataTitle'), localizeTelemetryError(locale, message) ?? message);
    } finally {
      setActionBusy(null);
    }
  };

  const currentScreenLabel = t(
    DRAWER_ITEMS.find((item) => item.id === activeScreenId)?.labelKey ?? 'tabDashboard',
  );

  const drawerTopPadding = insets.top + 12;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.arcLeft} />
      <View style={styles.arcRight} />

      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.menuButton} onPress={openDrawer}>
            <MaterialCommunityIcons name="menu" size={22} color="#E3FFF6" />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.appTitle}>{t('appTitle')}</Text>
            <Text style={styles.appSubtitle}>{t('screenLabel', { name: currentScreenLabel })}</Text>
          </View>

          <View style={[styles.statusPill, { borderColor: statusChipColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusChipColor }]} />
            <Text style={styles.statusPillText}>{t(statusKey(status))}</Text>
          </View>
        </View>

        {localizedError ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FFD6D6" />
            <Text style={styles.errorText}>{localizedError}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bodyWrap} {...panResponder.panHandlers}>
        <ScrollView
          contentContainerStyle={[
            styles.screenBody,
            isLandscape && styles.screenBodyLandscape,
          ]}
        >
          {activeScreenId === 'dashboard' ? (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroHeadRow}>
                  <View style={styles.heroTitleWrap}>
                    <Text style={styles.heroTitle}>{t(modelDetected.nameKey)}</Text>
                    <Text style={styles.heroSubtitle}>
                      {isConnected ? t('statusConnected') : t('modelDisconnectedHint')}
                    </Text>
                  </View>

                  <View style={styles.heroStatusBadge}>
                    <Text style={styles.heroStatusBadgeText}>{modelDetected.source.toUpperCase()}</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.heroImageCard,
                    isLandscape && styles.heroImageCardLandscape,
                  ]}
                >
                  <Image
                    source={TESLA_MODEL_IMAGES[modelDetected.key]}
                    style={[styles.heroImage, isLandscape && styles.heroImageLandscape]}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.quickActionsRow}>
                  <Pressable
                    style={styles.quickActionButton}
                    onPress={() => runAction('dashboard-discover', scanForAdapters)}
                    disabled={isBusy || actionBusy !== null}
                  >
                    <MaterialCommunityIcons name="radar" size={18} color="#0D1608" />
                    <Text style={styles.quickActionText}>{t('actionDiscover')}</Text>
                  </Pressable>

                  <Pressable style={styles.quickActionButtonSecondary} onPress={() => navigateToScreen('hvBattery')}>
                    <MaterialCommunityIcons name="car-battery" size={18} color="#CFE7DE" />
                    <Text style={styles.quickActionTextSecondary}>{t('actionGoHv')}</Text>
                  </Pressable>

                  <Pressable style={styles.quickActionButtonSecondary} onPress={() => navigateToScreen('errors')}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#CFE7DE" />
                    <Text style={styles.quickActionTextSecondary}>{t('actionViewErrors')}</Text>
                    <View style={styles.errorsBubble}>
                      <Text style={styles.errorsBubbleText}>{storedErrors.length}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View style={styles.metricGrid}>
                {dashboardWidgets.map((widget) => (
                  <View
                    key={widget.key}
                    style={[
                      styles.metricCard,
                      { width: metricCardWidth },
                      widget.accent === 'neon' && styles.metricCardAccent,
                      widget.accent === 'danger' && styles.metricCardDanger,
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricValue,
                        widget.accent === 'neon' && styles.metricValueAccent,
                        widget.accent === 'danger' && styles.metricValueDanger,
                      ]}
                    >
                      {widget.value}
                    </Text>
                    <Text
                      style={[
                        styles.metricUnit,
                        widget.accent === 'neon' && styles.metricUnitAccent,
                        widget.accent === 'danger' && styles.metricUnitDanger,
                      ]}
                    >
                      {widget.unit}
                    </Text>
                    <Text
                      style={[
                        styles.metricLabel,
                        widget.accent === 'neon' && styles.metricLabelAccent,
                        widget.accent === 'danger' && styles.metricLabelDanger,
                      ]}
                    >
                      {t(widget.labelKey)}
                    </Text>
                    {widget.statusText ? <Text style={styles.metricHint}>{widget.statusText}</Text> : null}
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="waveform" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('dashboardTelemetry')}</Text>
                </View>
                <View style={styles.telemetryRow}>
                  <Text style={styles.telemetryStat}>{`${frameCount} ${t('counterFrames')}`}</Text>
                  <Text style={styles.telemetryStat}>{`${signalCount} ${t('counterSignals')}`}</Text>
                </View>
              </View>
            </>
          ) : null}

          {activeScreenId === 'hvBattery' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="car-battery" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('sectionHvPack')}</Text>
                </View>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => setHvViewMode('grid')}
                    style={({ pressed }) => [
                      styles.ghostButton,
                      hvViewMode === 'grid' && styles.modeButtonActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="view-grid"
                      size={14}
                      color={hvViewMode === 'grid' ? '#DDF4FF' : '#A7D6CA'}
                    />
                    <Text style={hvViewMode === 'grid' ? styles.modeButtonTextActive : styles.ghostButtonText}>
                      {t('hvViewGrid')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setHvViewMode('bars')}
                    style={({ pressed }) => [
                      styles.ghostButton,
                      hvViewMode === 'bars' && styles.modeButtonActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="chart-bar"
                      size={14}
                      color={hvViewMode === 'bars' ? '#DDF4FF' : '#A7D6CA'}
                    />
                    <Text style={hvViewMode === 'bars' ? styles.modeButtonTextActive : styles.ghostButtonText}>
                      {t('hvViewBars')}
                    </Text>
                  </Pressable>
                </View>

                {hvCellSignals.length === 0 ? (
                  <Text style={styles.dimText}>{t('hvNoCellData')}</Text>
                ) : (
                  <>
                    <View style={styles.hvSummaryRow}>
                      <Text style={styles.hvSummaryText}>
                        {t('hvPageLabel', {
                          start: hvPageIndex * HV_CELLS_PER_PAGE + 1,
                          end: hvPageIndex * HV_CELLS_PER_PAGE + hvPageCells.length,
                        })}
                      </Text>
                      <Text style={styles.hvSummaryText}>{t('hvMin', { value: toFixedMaybe(hvMin ?? NaN, 3) })}</Text>
                      <Text style={styles.hvSummaryText}>{t('hvMax', { value: toFixedMaybe(hvMax ?? NaN, 3) })}</Text>
                      <Text style={styles.hvSummaryText}>{t('hvDelta', { value: toFixedMaybe(hvDelta ?? NaN, 4) })}</Text>
                    </View>

                    {hvViewMode === 'grid' ? (
                      <View style={styles.hvCellGrid}>
                        {hvPageCells.map((cell) => {
                          const isOutlier = hvMin !== null && cell.value <= hvMin + 0.01;
                          return (
                            <View
                              key={cell.key}
                              style={[
                                styles.hvCellTile,
                                { width: hvCellWidth },
                                isOutlier && styles.hvCellTileWarning,
                              ]}
                            >
                              <Text style={styles.hvCellValue}>{toFixedMaybe(cell.value, 3)}</Text>
                              <Text style={styles.hvCellName}>{t('hvCellLabel', { index: cell.index + 1 })}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.hvBarWrap}>
                        <View style={styles.hvAxisLabelColumn}>
                          <Text style={styles.hvAxisLabel}>{t('hvBarsYAxis')}</Text>
                        </View>

                        <View style={styles.hvBarsArea}>
                          <View style={styles.hvBarsRow}>
                            {hvPageCells.map((cell) => {
                              const normalized =
                                hvMax && hvMin !== null && hvMax > hvMin ? (cell.value - hvMin) / (hvMax - hvMin) : 0.6;
                              const height = 42 + normalized * 120;
                              const lowCell = hvMin !== null && cell.value <= hvMin + 0.01;

                              return (
                                <View key={cell.key} style={styles.hvBarItem}>
                                  <Text style={styles.hvBarValue}>{toFixedMaybe(cell.value, 3)}</Text>
                                  <View
                                    style={[
                                      styles.hvBar,
                                      {
                                        height,
                                        backgroundColor: lowCell ? '#D63838' : '#0D9B1B',
                                      },
                                    ]}
                                  />
                                  <Text style={styles.hvBarIndex}>{cell.index + 1}</Text>
                                </View>
                              );
                            })}
                          </View>
                          <Text style={styles.hvXAxisLabel}>{t('hvBarsXAxis')}</Text>
                        </View>
                      </View>
                    )}

                    <View style={styles.hvPagerRow}>
                      <Pressable
                        onPress={() => setHvPageIndex((current) => Math.max(0, current - 1))}
                        disabled={hvPageIndex === 0}
                        style={({ pressed }) => [
                          styles.pagerButton,
                          hvPageIndex === 0 && styles.pagerButtonDisabled,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <MaterialCommunityIcons name="chevron-left" size={20} color="#E4F5FF" />
                      </Pressable>

                      <Text style={styles.hvSummaryText}>{`${hvPageIndex + 1}/${hvPageCount}`}</Text>

                      <Pressable
                        onPress={() => setHvPageIndex((current) => Math.min(hvPageCount - 1, current + 1))}
                        disabled={hvPageIndex >= hvPageCount - 1}
                        style={({ pressed }) => [
                          styles.pagerButton,
                          hvPageIndex >= hvPageCount - 1 && styles.pagerButtonDisabled,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#E4F5FF" />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="engine-outline" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('sectionHvInternals')}</Text>
                </View>
                {hvAccessorySignals.length === 0 ? (
                  <Text style={styles.dimText}>{t('hvInternalsEmpty')}</Text>
                ) : (
                  hvAccessorySignals.map((signal) => (
                    <View key={signal.key} style={styles.secondaryRow}>
                      <View style={styles.signalInfoCell}>
                        <Text style={styles.secondaryLabel}>{signal.signalName}</Text>
                        <Text style={styles.signalMeta}>{signal.messageName}</Text>
                      </View>
                      <Text style={styles.secondaryValue}>{signal.displayValue}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}

          {activeScreenId === 'signals' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="target" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('sectionWatchedSignals')}</Text>
                </View>
                {watchedSignals.length === 0 ? (
                  <Text style={styles.dimText}>{t('watchedEmpty')}</Text>
                ) : (
                  watchedSignals.map((signal) => (
                    <View key={signal.key} style={styles.secondaryRow}>
                      <View style={styles.signalInfoCell}>
                        <Text style={styles.secondaryLabel}>{signal.label}</Text>
                        <Text style={styles.signalMeta}>{signal.messageName}</Text>
                      </View>
                      <Text style={styles.secondaryValue}>{signal.displayValue}</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="magnify" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('sectionSignalExplorer')}</Text>
                </View>
                <TextInput
                  value={signalFilter}
                  onChangeText={setSignalFilter}
                  style={styles.textInput}
                  placeholder={t('signalSearchPlaceholder')}
                  placeholderTextColor="#6F7B7A"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {filteredSignalRows.length === 0 ? (
                  <Text style={styles.dimText}>{t('noSignalMatches')}</Text>
                ) : (
                  filteredSignalRows.map((signal) => (
                    <View key={signal.key} style={styles.signalListRow}>
                      <View style={styles.signalInfoCell}>
                        <Text style={styles.signalName}>{signal.signalName}</Text>
                        <Text style={styles.signalMeta}>{signal.messageName}</Text>
                      </View>
                      <Text style={styles.signalValue}>{signal.displayValue}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}

          {activeScreenId === 'adapter' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="bluetooth-connect" size={17} color="#BEE8DB" />
                <Text style={styles.sectionTitle}>{t('sectionBluetoothAdapters')}</Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => runAction('adapter-scan', scanForAdapters)}
                  disabled={isBusy || actionBusy !== null}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <MaterialCommunityIcons name="magnify" size={14} color="#06251D" />
                  <Text style={styles.primaryButtonText}>
                    {actionBusy === 'adapter-scan' ? t('actionScanning') : t('actionScanAdapters')}
                  </Text>
                </Pressable>
                {status === 'connected' ? (
                  <Pressable
                    onPress={() => runAction('stream-start', startStreaming)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  >
                    <MaterialCommunityIcons name="play-circle-outline" size={14} color="#06251D" />
                    <Text style={styles.primaryButtonText}>
                      {actionBusy === 'stream-start' ? t('actionStarting') : t('actionStartStream')}
                    </Text>
                  </Pressable>
                ) : null}
                {status === 'streaming' ? (
                  <Pressable
                    onPress={() => runAction('stream-stop', stopStreaming)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                  >
                    <MaterialCommunityIcons name="stop-circle-outline" size={14} color="#A7D6CA" />
                    <Text style={styles.ghostButtonText}>
                      {actionBusy === 'stream-stop' ? t('actionStopping') : t('actionStopStream')}
                    </Text>
                  </Pressable>
                ) : null}
                {isConnected ? (
                  <Pressable
                    onPress={() => runAction('adapter-disconnect', disconnect)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                  >
                    <MaterialCommunityIcons name="link-variant-off" size={14} color="#A7D6CA" />
                    <Text style={styles.ghostButtonText}>{t('actionDisconnect')}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleExport}
                  disabled={actionBusy !== null}
                  style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                >
                  <MaterialCommunityIcons name="file-export-outline" size={14} color="#A7D6CA" />
                  <Text style={styles.ghostButtonText}>
                    {actionBusy === 'export' ? t('actionExporting') : t('actionExportCsv')}
                  </Text>
                </Pressable>
              </View>

              {lastExportUri ? (
                <Text style={styles.dimText} numberOfLines={1}>
                  {t('lastExport', { uri: lastExportUri })}
                </Text>
              ) : null}

              {devices.length === 0 ? (
                <Text style={styles.dimText}>{t('noAdapters')}</Text>
              ) : (
                devices.map((device) => {
                  const isSelected = selectedDevice?.id === device.id;
                  return (
                    <View key={device.id} style={[styles.deviceRow, isSelected && styles.deviceRowActive]}>
                      <View style={styles.signalInfoCell}>
                        <Text style={styles.deviceName}>{device.name}</Text>
                        <Text style={styles.signalMeta}>
                          {t('rssiLabel', { value: device.rssi ?? t('genericNotAvailable') })}
                        </Text>
                        <Text style={styles.signalMeta}>{device.id}</Text>
                      </View>
                      <Pressable
                        onPress={() => runAction(`connect-${device.id}`, () => connectToAdapter(device.id))}
                        disabled={actionBusy !== null || status === 'streaming'}
                        style={({ pressed }) => [styles.connectButton, pressed && styles.buttonPressed]}
                      >
                        {actionBusy === `connect-${device.id}` ? (
                          <ActivityIndicator color="#0C1A17" />
                        ) : (
                          <Text style={styles.connectButtonText}>
                            {isSelected ? t('connectedState') : t('actionConnect')}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {activeScreenId === 'console' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="console-line" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('sectionManualCommands')}</Text>
                </View>
                <View style={styles.commandRow}>
                  <TextInput
                    value={commandInput}
                    onChangeText={setCommandInput}
                    style={styles.textInput}
                    placeholder={t('commandPlaceholder')}
                    placeholderTextColor="#6F7B7A"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <Pressable
                    onPress={handleCommand}
                    disabled={commandBusy || !isConnected || status === 'streaming'}
                    style={({ pressed }) => [styles.connectButton, pressed && styles.buttonPressed]}
                  >
                    {commandBusy ? (
                      <ActivityIndicator color="#0C1A17" />
                    ) : (
                      <Text style={styles.connectButtonText}>{t('actionSend')}</Text>
                    )}
                  </Pressable>
                </View>

                {!isConnected ? <Text style={styles.dimText}>{t('commandRequiresAdapter')}</Text> : null}
                {status === 'streaming' ? (
                  <Text style={styles.dimText}>{t('commandBlockedWhileStreaming')}</Text>
                ) : null}

                {commandOutput.length > 0 ? (
                  <View style={styles.commandOutputCard}>
                    {commandOutput.map((line, index) => (
                      <Text key={`${line}-${index}`} style={styles.commandOutputText}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="barcode-scan" size={17} color="#BEE8DB" />
                  <Text style={styles.sectionTitle}>{t('sectionRawCan')}</Text>
                </View>
                {recentRawFrames.length === 0 ? (
                  <Text style={styles.dimText}>{t('waitingTraffic')}</Text>
                ) : (
                  recentRawFrames.map((line, index) => (
                    <Text key={`${line}-${index}`} style={styles.rawLine}>
                      {line}
                    </Text>
                  ))
                )}
              </View>
            </>
          ) : null}

          {activeScreenId === 'errors' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRowBetween}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={17} color="#FFC5C5" />
                  <Text style={styles.sectionTitle}>{t('errorsCurrentTitle')}</Text>
                </View>

                <Pressable
                  onPress={() => setStoredErrors([])}
                  style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                >
                  <MaterialCommunityIcons name="delete-outline" size={14} color="#A7D6CA" />
                  <Text style={styles.ghostButtonText}>{t('actionClearErrors')}</Text>
                </Pressable>
              </View>

              <Text style={styles.errorsCountText}>{t('errorsStoredCount', { count: storedErrors.length })}</Text>

              {storedErrors.length === 0 ? (
                <Text style={styles.dimText}>{t('errorsNoneStored')}</Text>
              ) : (
                storedErrors.map((entry) => (
                  <View key={entry.id} style={styles.errorLogRow}>
                    <Text style={styles.errorLogMessage}>{entry.message}</Text>
                    <Text style={styles.errorLogTime}>{t('errorLoggedAt', { time: formatErrorTimestamp(entry.createdAt) })}</Text>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {activeScreenId === 'settings' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="cog-outline" size={17} color="#BEE8DB" />
                <Text style={styles.sectionTitle}>{t('sectionAppSettings')}</Text>
              </View>

              <View style={styles.settingsBlock}>
                <Text style={styles.settingsLabel}>{t('sectionLanguageSettings')}</Text>
                <View style={styles.localeRow}>
                  <Pressable
                    onPress={() => setLocale('en')}
                    style={({ pressed }) => [
                      styles.localeChip,
                      locale === 'en' && styles.localeChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={locale === 'en' ? styles.localeTextActive : styles.localeText}>{t('languageEN')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLocale('ro')}
                    style={({ pressed }) => [
                      styles.localeChip,
                      locale === 'ro' && styles.localeChipActive,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={locale === 'ro' ? styles.localeTextActive : styles.localeText}>{t('languageRO')}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsBlock}>
                <Text style={styles.settingsLabel}>{t('sectionVehicleProfile')}</Text>
                <View style={styles.profileGrid}>
                  {vehicleProfiles.map((profile) => {
                    const selected = profile.id === selectedVehicleProfileId;
                    return (
                      <Pressable
                        key={profile.id}
                        onPress={() => runAction(`profile-${profile.id}`, () => setVehicleProfile(profile.id))}
                        disabled={actionBusy !== null || status === 'streaming' || status === 'connected'}
                        style={({ pressed }) => [
                          styles.profileCard,
                          { width: profileCardWidth },
                          selected && styles.profileCardActive,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={selected ? styles.profileTitleActive : styles.profileTitle}>
                          {profileDisplayName(locale, profile.id)}
                        </Text>
                        <Text style={selected ? styles.profileDescriptionActive : styles.profileDescription}>
                          {profileDisplayDescription(locale, profile.id, profile.description)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.settingsBlock}>
                <Text style={styles.settingsLabel}>{t('sectionConnectionSettings')}</Text>
                <Text style={styles.settingsHint}>
                  {selectedDevice ? `${t('settingsCurrentAdapter')}: ${selectedDevice.name}` : t('settingsNoAdapter')}
                </Text>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => runAction('settings-scan', scanForAdapters)}
                    disabled={isBusy || actionBusy !== null}
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  >
                    <MaterialCommunityIcons name="magnify" size={14} color="#06251D" />
                    <Text style={styles.primaryButtonText}>{t('actionScanAdapters')}</Text>
                  </Pressable>
                  {isConnected ? (
                    <Pressable
                      onPress={() => runAction('settings-disconnect', disconnect)}
                      disabled={actionBusy !== null}
                      style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                    >
                      <MaterialCommunityIcons name="link-variant-off" size={14} color="#A7D6CA" />
                      <Text style={styles.ghostButtonText}>{t('actionDisconnect')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>

      {drawerVisible ? (
        <View style={styles.drawerLayer} pointerEvents="box-none">
          <Animated.View style={[styles.drawerBackdrop, { opacity: drawerBackdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: Math.min(DRAWER_WIDTH, windowWidth * 0.78),
                paddingTop: drawerTopPadding,
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <MaterialCommunityIcons name="menu-open" size={20} color="#DDF8EE" />
              <Text style={styles.drawerHeaderText}>{t('drawerNavigation')}</Text>
            </View>

            {DRAWER_ITEMS.map((item) => {
              const selected = item.id === activeScreenId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => navigateToScreen(item.id)}
                  style={({ pressed }) => [
                    styles.drawerItem,
                    selected && styles.drawerItemActive,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <MaterialCommunityIcons name={item.icon} size={18} color={selected ? '#E8F8FF' : '#9EC7BD'} />
                  <Text style={selected ? styles.drawerItemTextActive : styles.drawerItemText}>{t(item.labelKey)}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

const fontHeading = Platform.select({
  ios: 'AvenirNext-DemiBold',
  android: 'sans-serif-medium',
  default: 'System',
});
const fontBody = Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: 'System' });
const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0F10',
  },
  bodyWrap: {
    flex: 1,
  },
  arcLeft: {
    position: 'absolute',
    width: 430,
    height: 430,
    borderRadius: 320,
    borderWidth: 38,
    borderColor: NEON,
    opacity: 0.14,
    top: -250,
    left: -250,
  },
  arcRight: {
    position: 'absolute',
    width: 430,
    height: 430,
    borderRadius: 320,
    borderWidth: 38,
    borderColor: NEON,
    opacity: 0.12,
    top: -260,
    right: -250,
  },
  headerCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#272B2B',
    backgroundColor: 'rgba(20, 22, 22, 0.94)',
    padding: 10,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2F3534',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1B1D1E',
  },
  headerTitleWrap: {
    flex: 1,
    gap: 1,
  },
  appTitle: {
    color: '#EFF3F2',
    fontFamily: fontHeading,
    fontSize: 19,
    letterSpacing: 0.4,
  },
  appSubtitle: {
    color: '#9BA2A0',
    fontFamily: fontBody,
    fontSize: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
    backgroundColor: '#1A1E1D',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    color: '#E7FBF4',
    fontFamily: fontHeading,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  errorCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#763737',
    backgroundColor: 'rgba(124, 38, 38, 0.45)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    color: '#FFD6D6',
    fontFamily: fontBody,
    fontSize: 12,
    flex: 1,
  },
  screenBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 10,
  },
  screenBodyLandscape: {
    paddingHorizontal: 16,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2B302F',
    backgroundColor: '#151718',
    padding: 12,
    gap: 12,
  },
  heroHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroTitleWrap: {
    flex: 1,
  },
  heroTitle: {
    color: '#F4F7F6',
    fontFamily: fontHeading,
    fontSize: 30,
    letterSpacing: 0.3,
  },
  heroSubtitle: {
    color: '#A3AAA8',
    fontFamily: fontBody,
    fontSize: 13,
  },
  heroStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#38403D',
    backgroundColor: '#1C2120',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroStatusBadgeText: {
    color: '#BFD2CB',
    fontFamily: fontHeading,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  heroImageCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E3433',
    minHeight: 176,
    backgroundColor: '#101314',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  heroImageCardLandscape: {
    minHeight: 150,
  },
  heroImage: {
    width: '100%',
    height: 164,
  },
  heroImageLandscape: {
    height: 138,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: NEON,
    borderWidth: 1,
    borderColor: '#9CD112',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  quickActionText: {
    color: '#0D1608',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  quickActionButtonSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3C4644',
    backgroundColor: '#1B2021',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  quickActionTextSecondary: {
    color: '#D1E3DD',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  errorsBubble: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#FF6363',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  errorsBubbleText: {
    color: '#FFF',
    fontFamily: fontHeading,
    fontSize: 11,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    width: '48.8%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C3332',
    backgroundColor: '#141617',
    minHeight: 126,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  metricCardAccent: {
    borderColor: '#B8EC18',
    backgroundColor: '#C7FF19',
  },
  metricCardDanger: {
    borderColor: '#B84141',
  },
  metricValue: {
    color: '#F3F6F5',
    fontFamily: fontHeading,
    fontSize: 44,
    lineHeight: 48,
  },
  metricValueAccent: {
    color: '#101B08',
  },
  metricValueDanger: {
    color: '#FFD6D6',
  },
  metricUnit: {
    color: '#B5BDBA',
    fontFamily: fontBody,
    fontSize: 22,
    marginTop: -4,
  },
  metricUnitAccent: {
    color: '#101B08',
  },
  metricUnitDanger: {
    color: '#FFC6C6',
  },
  metricLabel: {
    color: '#9AA2A0',
    fontFamily: fontBody,
    fontSize: 14,
    marginTop: 2,
  },
  metricLabelAccent: {
    color: '#141A10',
  },
  metricLabelDanger: {
    color: '#FFCFCF',
  },
  metricHint: {
    color: '#8BA89E',
    fontFamily: fontHeading,
    fontSize: 12,
    marginTop: 4,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232A2A',
    backgroundColor: '#161A1B',
    padding: 12,
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitleRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: '#D8F5EC',
    fontFamily: fontHeading,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  telemetryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  telemetryStat: {
    color: '#C8E1D9',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#30D8A0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryButtonText: {
    color: '#06251D',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  ghostButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#44746A',
    backgroundColor: 'rgba(8, 22, 19, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ghostButtonText: {
    color: '#A7D6CA',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  modeButtonActive: {
    borderColor: '#65BDFF',
    backgroundColor: 'rgba(23, 50, 63, 0.88)',
  },
  modeButtonTextActive: {
    color: '#DDF4FF',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  hvSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  hvSummaryText: {
    color: '#9ECBC0',
    fontFamily: fontBody,
    fontSize: 12,
  },
  hvCellGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hvCellTile: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4A5754',
    backgroundColor: '#272B2B',
    minHeight: 92,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  hvCellTileWarning: {
    borderColor: '#8D4D41',
    backgroundColor: '#2D2525',
  },
  hvCellValue: {
    color: '#F0F1F1',
    fontFamily: fontHeading,
    fontSize: 34,
  },
  hvCellName: {
    color: '#C9CED0',
    fontFamily: fontBody,
    fontSize: 22,
  },
  hvBarWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  hvAxisLabelColumn: {
    justifyContent: 'center',
    width: 34,
  },
  hvAxisLabel: {
    color: '#C0D4CE',
    fontFamily: fontBody,
    fontSize: 11,
  },
  hvBarsArea: {
    flex: 1,
    gap: 8,
  },
  hvBarsRow: {
    minHeight: 184,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 5,
  },
  hvBarItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  hvBarValue: {
    color: '#EAF7F2',
    fontFamily: fontBody,
    fontSize: 10,
  },
  hvBar: {
    width: '100%',
    borderRadius: 5,
  },
  hvBarIndex: {
    color: '#C9DDD7',
    fontFamily: fontBody,
    fontSize: 11,
  },
  hvXAxisLabel: {
    color: '#BCD1CB',
    fontFamily: fontBody,
    fontSize: 12,
    textAlign: 'center',
  },
  hvPagerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  pagerButton: {
    width: 42,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#145D86',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerButtonDisabled: {
    opacity: 0.38,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1B3530',
    paddingBottom: 6,
    gap: 8,
  },
  secondaryLabel: {
    color: '#A7D5CA',
    fontFamily: fontBody,
    fontSize: 13,
    flex: 1,
  },
  secondaryValue: {
    color: '#EEFFF8',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  signalListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#16302B',
    paddingVertical: 7,
    gap: 8,
  },
  signalInfoCell: {
    flex: 1,
    gap: 2,
  },
  signalName: {
    color: '#D0EEE4',
    fontFamily: fontBody,
    fontSize: 12,
  },
  signalMeta: {
    color: '#729A90',
    fontFamily: fontBody,
    fontSize: 11,
  },
  signalValue: {
    color: '#F2FFF8',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileCard: {
    flexBasis: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#355A53',
    backgroundColor: 'rgba(8, 21, 19, 0.8)',
    padding: 10,
    gap: 3,
  },
  profileCardActive: {
    borderColor: '#6BC3FF',
    backgroundColor: 'rgba(18, 45, 59, 0.8)',
  },
  profileTitle: {
    color: '#A8D2C7',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  profileTitleActive: {
    color: '#E2F3FF',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  profileDescription: {
    color: '#7FA69C',
    fontFamily: fontBody,
    fontSize: 11,
  },
  profileDescriptionActive: {
    color: '#9ACFEF',
    fontFamily: fontBody,
    fontSize: 11,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#294841',
    borderRadius: 10,
    padding: 9,
  },
  deviceRowActive: {
    borderColor: '#65B8F1',
    backgroundColor: 'rgba(22, 44, 56, 0.55)',
  },
  deviceName: {
    color: '#E9FFF7',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  connectButton: {
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#77CCFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  connectButtonText: {
    color: '#09221B',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#31544C',
    backgroundColor: '#0D211D',
    color: '#ECFFF8',
    fontFamily: fontBody,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  commandOutputCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2D4C44',
    backgroundColor: '#091A17',
    padding: 9,
    gap: 3,
  },
  commandOutputText: {
    color: '#CCE5DC',
    fontFamily: monoFont,
    fontSize: 12,
  },
  rawLine: {
    color: '#D5ECE4',
    fontFamily: monoFont,
    fontSize: 11,
    lineHeight: 16,
    paddingVertical: 1,
  },
  errorsCountText: {
    color: '#9ECBC0',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  errorLogRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#543535',
    backgroundColor: 'rgba(62, 23, 23, 0.5)',
    padding: 9,
    gap: 4,
  },
  errorLogMessage: {
    color: '#FFDADA',
    fontFamily: fontBody,
    fontSize: 12,
  },
  errorLogTime: {
    color: '#CFA7A7',
    fontFamily: fontBody,
    fontSize: 11,
  },
  settingsBlock: {
    gap: 8,
    paddingTop: 4,
  },
  settingsLabel: {
    color: '#C5E8DD',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  settingsHint: {
    color: '#89B3A8',
    fontFamily: fontBody,
    fontSize: 12,
  },
  localeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  localeChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3D655C',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(8, 21, 19, 0.8)',
  },
  localeChipActive: {
    borderColor: '#66BEFF',
    backgroundColor: 'rgba(23, 50, 63, 0.85)',
  },
  localeText: {
    color: '#A2CBC0',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  localeTextActive: {
    color: '#DFF4FF',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  drawerLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    justifyContent: 'flex-start',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    top: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#0C2020',
    borderRightWidth: 1,
    borderColor: '#2D4D48',
    paddingHorizontal: 12,
    gap: 8,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#23403A',
    marginBottom: 6,
  },
  drawerHeaderText: {
    color: '#DDF8EE',
    fontFamily: fontHeading,
    fontSize: 15,
  },
  drawerItem: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#1D3531',
    backgroundColor: 'rgba(8, 22, 20, 0.85)',
  },
  drawerItemActive: {
    borderColor: '#5AADE2',
    backgroundColor: 'rgba(20, 44, 58, 0.9)',
  },
  drawerItemText: {
    color: '#9EC7BD',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  drawerItemTextActive: {
    color: '#E8F8FF',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  dimText: {
    color: '#7FA59B',
    fontFamily: fontBody,
    fontSize: 12,
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
