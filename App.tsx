import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SignalTile, TelemetryStatus, useTelemetryController } from './src/app/useTelemetryController';
import { LocaleCode, localizeTelemetryError, TranslationKey, translate } from './src/lib/i18n/localization';
import { pickHvAccessorySignals, pickHvCellSignals } from './src/lib/hv/hvSignalCatalog';

type AppTabId = 'dashboard' | 'hvBattery' | 'signals' | 'adapter' | 'console';
type HvViewMode = 'grid' | 'bars';

interface AppTab {
  id: AppTabId;
  label: string;
}

interface MetricCardModel {
  key: string;
  label: string;
  value: string;
  metadata: string;
  stale: boolean;
}

const HV_CELLS_PER_PAGE = 12;

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString();
}

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

function buildMetricCards(signals: SignalTile[], signalKeys: string[], waitingLabel: string): MetricCardModel[] {
  const mapByCanonicalName = new Map<string, SignalTile>();
  for (const signal of signals) {
    mapByCanonicalName.set(signal.signalName, signal);
  }

  return signalKeys.map((key) => {
    const signal = mapByCanonicalName.get(key);

    if (!signal) {
      return {
        key,
        label: key,
        value: '--',
        metadata: waitingLabel,
        stale: true,
      };
    }

    return {
      key,
      label: signal.label,
      value: signal.displayValue,
      metadata: `${signal.messageName}  ${formatTimestamp(signal.updatedAt)}`,
      stale: Date.now() - signal.updatedAt > 3500,
    };
  });
}

function toFixedMaybe(value: number, digits: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

export default function App() {
  const {
    status,
    error,
    devices,
    selectedDevice,
    frameCount,
    signalCount,
    signals,
    activeSessionId,
    lastExportUri,
    recentRawFrames,
    vehicleProfiles,
    selectedVehicleProfileId,
    selectedVehicleProfile,
    scanForAdapters,
    connectToAdapter,
    disconnect,
    setVehicleProfile,
    startStreaming,
    stopStreaming,
    sendAtCommand,
    exportLatestSession,
  } = useTelemetryController();

  const [locale, setLocale] = useState<LocaleCode>('en');
  const [activeTabId, setActiveTabId] = useState<AppTabId>('dashboard');
  const [hvViewMode, setHvViewMode] = useState<HvViewMode>('grid');
  const [hvPageIndex, setHvPageIndex] = useState(0);
  const [signalFilter, setSignalFilter] = useState('');
  const [commandInput, setCommandInput] = useState('ATI');
  const [commandOutput, setCommandOutput] = useState<string[]>([]);
  const [commandBusy, setCommandBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const tabs: AppTab[] = useMemo(
    () => [
      { id: 'dashboard', label: t('tabDashboard') },
      { id: 'hvBattery', label: t('tabHvBattery') },
      { id: 'signals', label: t('tabSignals') },
      { id: 'adapter', label: t('tabAdapter') },
      { id: 'console', label: t('tabConsole') },
    ],
    [t],
  );

  const watchedSignals = useMemo(() => signals.filter((signal) => signal.watched), [signals]);
  const additionalSignals = useMemo(() => signals.filter((signal) => !signal.watched), [signals]);

  const primaryMetricCards = useMemo(
    () => buildMetricCards(watchedSignals, selectedVehicleProfile.dashboardPrimaryMetrics, t('waitingForData')),
    [selectedVehicleProfile.dashboardPrimaryMetrics, t, watchedSignals],
  );

  const secondaryMetricCards = useMemo(
    () => buildMetricCards(watchedSignals, selectedVehicleProfile.dashboardSecondaryMetrics, t('waitingForData')),
    [selectedVehicleProfile.dashboardSecondaryMetrics, t, watchedSignals],
  );

  const filteredSignalRows = useMemo(() => {
    const needle = signalFilter.trim().toLowerCase();
    if (!needle) {
      return additionalSignals.slice(0, 140);
    }

    return additionalSignals
      .filter((signal) => {
        const haystack = `${signal.signalName} ${signal.label} ${signal.messageName}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 140);
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

  const isConnected = status === 'connected' || status === 'streaming';
  const isBusy = status === 'booting' || status === 'connecting';

  const statusChipColor =
    status === 'streaming'
      ? '#20D69A'
      : status === 'connected'
        ? '#67B7FF'
        : status === 'error'
          ? '#FF7E7E'
          : '#F5B66A';

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
      setCommandOutput(lines.length > 0 ? lines : ['<empty response>']);
    } catch (commandError) {
      const message = commandError instanceof Error ? commandError.message : String(commandError);
      const localizedMessage = localizeTelemetryError(locale, message) ?? message;
      setCommandOutput([`${t('commandErrorPrefix')}: ${localizedMessage}`]);
    } finally {
      setCommandBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.topGlow} />
      <View style={styles.bottomGlow} />

      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.appTitle}>{t('appTitle')}</Text>
            <Text style={styles.appSubtitle}>{t('appSubtitle')}</Text>
          </View>

          <View style={styles.headerTopRight}>
            <View style={[styles.statusPill, { borderColor: statusChipColor }]}> 
              <View style={[styles.statusDot, { backgroundColor: statusChipColor }]} />
              <Text style={styles.statusPillText}>{t(statusKey(status))}</Text>
            </View>

            <View style={styles.localeSwitchWrap}>
              <Text style={styles.localeLabel}>{t('languageLabel')}</Text>
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
          </View>
        </View>

        <View style={styles.headerMetaRow}>
          <Text style={styles.headerMetaText}>
            {t('profileLabel', { name: profileDisplayName(locale, selectedVehicleProfileId) })}
          </Text>
          <Text style={styles.headerMetaText}>
            {selectedDevice
              ? t('adapterConnected', { name: selectedDevice.name })
              : t('adapterDisconnected')}
          </Text>
        </View>

        <View style={styles.counterRow}>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>{t('counterFrames')}</Text>
            <Text style={styles.counterValue}>{frameCount}</Text>
          </View>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>{t('counterSignals')}</Text>
            <Text style={styles.counterValue}>{signalCount}</Text>
          </View>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>{t('counterSession')}</Text>
            <Text style={styles.counterValue}>{activeSessionId ? t('sessionLive') : t('sessionIdle')}</Text>
          </View>
        </View>

        {localizedError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{localizedError}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.screenBody}>
        {activeTabId === 'dashboard' ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionLiveControls')}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => runAction('scan', scanForAdapters)}
                  disabled={isBusy || actionBusy !== null}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.primaryButtonText}>{actionBusy === 'scan' ? t('actionScanning') : t('actionScan')}</Text>
                </Pressable>

                {isConnected ? (
                  <Pressable
                    onPress={() => runAction('disconnect', disconnect)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.ghostButtonText}>
                      {actionBusy === 'disconnect' ? t('actionDisconnecting') : t('actionDisconnect')}
                    </Text>
                  </Pressable>
                ) : null}

                {status === 'connected' ? (
                  <Pressable
                    onPress={() => runAction('stream-start', startStreaming)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {actionBusy === 'stream-start' ? t('actionStarting') : t('actionStartStream')}
                    </Text>
                  </Pressable>
                ) : null}

                {status === 'streaming' ? (
                  <Pressable
                    onPress={() => runAction('stream-stop', stopStreaming)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.warningButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.warningButtonText}>
                      {actionBusy === 'stream-stop' ? t('actionStopping') : t('actionStopStream')}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => runAction('export', async () => void (await exportLatestSession()))}
                  disabled={actionBusy !== null}
                  style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.ghostButtonText}>{actionBusy === 'export' ? t('actionExporting') : t('actionExportCsv')}</Text>
                </Pressable>
              </View>
              {lastExportUri ? <Text style={styles.exportHint}>{t('lastExport', { uri: lastExportUri })}</Text> : null}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionPrimaryWidgets')}</Text>
              <View style={styles.widgetGrid}>
                {primaryMetricCards.map((card) => (
                  <View key={card.key} style={[styles.widgetCard, card.stale && styles.widgetCardStale]}>
                    <Text style={styles.widgetLabel}>{card.label}</Text>
                    <Text style={styles.widgetValue}>{card.value}</Text>
                    <Text style={styles.widgetMeta}>{card.metadata}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionSecondaryMetrics')}</Text>
              {secondaryMetricCards.map((card) => (
                <View key={card.key} style={styles.secondaryRow}>
                  <Text style={styles.secondaryLabel}>{card.label}</Text>
                  <Text style={styles.secondaryValue}>{card.value}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {activeTabId === 'hvBattery' ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionHvPack')}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => setHvViewMode('grid')}
                  style={({ pressed }) => [styles.ghostButton, hvViewMode === 'grid' && styles.modeButtonActive, pressed && styles.buttonPressed]}
                >
                  <Text style={hvViewMode === 'grid' ? styles.modeButtonTextActive : styles.ghostButtonText}>{t('hvViewGrid')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setHvViewMode('bars')}
                  style={({ pressed }) => [styles.ghostButton, hvViewMode === 'bars' && styles.modeButtonActive, pressed && styles.buttonPressed]}
                >
                  <Text style={hvViewMode === 'bars' ? styles.modeButtonTextActive : styles.ghostButtonText}>{t('hvViewBars')}</Text>
                </Pressable>
              </View>

              {hvCellSignals.length === 0 ? (
                <Text style={styles.dimText}>{t('hvNoCellData')}</Text>
              ) : (
                <>
                  <View style={styles.hvSummaryRow}>
                    <Text style={styles.hvSummaryText}>{t('hvPageLabel', { start: hvPageIndex * HV_CELLS_PER_PAGE + 1, end: hvPageIndex * HV_CELLS_PER_PAGE + hvPageCells.length })}</Text>
                    <Text style={styles.hvSummaryText}>{t('hvMin', { value: toFixedMaybe(hvMin ?? NaN, 3) })}</Text>
                    <Text style={styles.hvSummaryText}>{t('hvMax', { value: toFixedMaybe(hvMax ?? NaN, 3) })}</Text>
                    <Text style={styles.hvSummaryText}>{t('hvDelta', { value: toFixedMaybe(hvDelta ?? NaN, 4) })}</Text>
                  </View>

                  {hvViewMode === 'grid' ? (
                    <View style={styles.hvCellGrid}>
                      {hvPageCells.map((cell) => {
                        const isOutlier = hvMin !== null && cell.value <= hvMin + 0.01;
                        return (
                          <View key={cell.key} style={[styles.hvCellTile, isOutlier && styles.hvCellTileWarning]}>
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
                            const normalized = hvMax && hvMin !== null && hvMax > hvMin ? (cell.value - hvMin) / (hvMax - hvMin) : 0.6;
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
                      style={({ pressed }) => [styles.pagerButton, hvPageIndex === 0 && styles.pagerButtonDisabled, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.pagerButtonText}>{'<'}</Text>
                    </Pressable>

                    <Text style={styles.hvSummaryText}>{`${hvPageIndex + 1}/${hvPageCount}`}</Text>

                    <Pressable
                      onPress={() => setHvPageIndex((current) => Math.min(hvPageCount - 1, current + 1))}
                      disabled={hvPageIndex >= hvPageCount - 1}
                      style={({ pressed }) => [styles.pagerButton, hvPageIndex >= hvPageCount - 1 && styles.pagerButtonDisabled, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.pagerButtonText}>{'>'}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionHvInternals')}</Text>
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

        {activeTabId === 'signals' ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionWatchedSignals')}</Text>
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
              <Text style={styles.sectionTitle}>{t('sectionSignalExplorer')}</Text>
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

        {activeTabId === 'adapter' ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionVehicleProfile')}</Text>
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

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionBluetoothAdapters')}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => runAction('adapter-scan', scanForAdapters)}
                  disabled={isBusy || actionBusy !== null}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.primaryButtonText}>{t('actionScanAdapters')}</Text>
                </Pressable>
                {isConnected ? (
                  <Pressable
                    onPress={() => runAction('adapter-disconnect', disconnect)}
                    disabled={actionBusy !== null}
                    style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.ghostButtonText}>{t('actionDisconnect')}</Text>
                  </Pressable>
                ) : null}
              </View>

              {devices.length === 0 ? (
                <Text style={styles.dimText}>{t('noAdapters')}</Text>
              ) : (
                devices.map((device) => {
                  const isSelected = selectedDevice?.id === device.id;
                  return (
                    <View key={device.id} style={[styles.deviceRow, isSelected && styles.deviceRowActive]}>
                      <View style={styles.signalInfoCell}>
                        <Text style={styles.deviceName}>{device.name}</Text>
                        <Text style={styles.signalMeta}>{t('rssiLabel', { value: device.rssi ?? 'n/a' })}</Text>
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
                          <Text style={styles.connectButtonText}>{isSelected ? t('connectedState') : t('actionConnect')}</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}

        {activeTabId === 'console' ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t('sectionManualCommands')}</Text>
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
                  disabled={commandBusy || !isConnected}
                  style={({ pressed }) => [styles.connectButton, pressed && styles.buttonPressed]}
                >
                  {commandBusy ? <ActivityIndicator color="#0C1A17" /> : <Text style={styles.connectButtonText}>{t('actionSend')}</Text>}
                </Pressable>
              </View>

              {!isConnected ? <Text style={styles.dimText}>{t('commandRequiresAdapter')}</Text> : null}

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
              <Text style={styles.sectionTitle}>{t('sectionRawCan')}</Text>
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
      </ScrollView>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const selected = tab.id === activeTabId;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTabId(tab.id)}
              style={({ pressed }) => [styles.tabItem, selected && styles.tabItemActive, pressed && styles.buttonPressed]}
            >
              <Text style={selected ? styles.tabItemTextActive : styles.tabItemText}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const fontHeading = Platform.select({ ios: 'AvenirNext-DemiBold', android: 'sans-serif-medium', default: 'System' });
const fontBody = Platform.select({ ios: 'AvenirNext-Regular', android: 'sans-serif', default: 'System' });

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#061413',
  },
  topGlow: {
    position: 'absolute',
    top: -120,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 140,
    backgroundColor: '#1E6C56',
    opacity: 0.35,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -150,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#285078',
    opacity: 0.28,
  },
  headerCard: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#284C45',
    backgroundColor: 'rgba(10, 33, 30, 0.9)',
    padding: 14,
    gap: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTopRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  appTitle: {
    color: '#F2FFF8',
    fontFamily: fontHeading,
    fontSize: 28,
    letterSpacing: 1,
  },
  appSubtitle: {
    color: '#A1C6BC',
    fontFamily: fontBody,
    fontSize: 13,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    backgroundColor: 'rgba(4, 15, 13, 0.7)',
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusPillText: {
    color: '#E7FBF4',
    fontFamily: fontHeading,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  localeSwitchWrap: {
    alignItems: 'flex-end',
    gap: 4,
  },
  localeLabel: {
    color: '#9EC5BA',
    fontFamily: fontBody,
    fontSize: 11,
  },
  localeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  localeChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3D655C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(8, 21, 19, 0.8)',
  },
  localeChipActive: {
    borderColor: '#66BEFF',
    backgroundColor: 'rgba(23, 50, 63, 0.85)',
  },
  localeText: {
    color: '#A2CBC0',
    fontFamily: fontHeading,
    fontSize: 11,
  },
  localeTextActive: {
    color: '#DFF4FF',
    fontFamily: fontHeading,
    fontSize: 11,
  },
  headerMetaRow: {
    gap: 2,
  },
  headerMetaText: {
    color: '#85B3A7',
    fontFamily: fontBody,
    fontSize: 12,
  },
  counterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  counterCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22443D',
    backgroundColor: 'rgba(6, 19, 17, 0.85)',
    padding: 10,
    gap: 4,
  },
  counterLabel: {
    color: '#78A99C',
    fontFamily: fontBody,
    fontSize: 11,
  },
  counterValue: {
    color: '#ECFFF7',
    fontFamily: fontHeading,
    fontSize: 19,
  },
  errorCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#763737',
    backgroundColor: 'rgba(124, 38, 38, 0.45)',
    padding: 10,
  },
  errorText: {
    color: '#FFD6D6',
    fontFamily: fontBody,
    fontSize: 12,
  },
  screenBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 96,
    gap: 12,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#223F3A',
    backgroundColor: 'rgba(7, 22, 20, 0.9)',
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    color: '#D8F5EC',
    fontFamily: fontHeading,
    fontSize: 16,
    letterSpacing: 0.4,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#30D8A0',
  },
  primaryButtonText: {
    color: '#06251D',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  ghostButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#44746A',
    backgroundColor: 'rgba(8, 22, 19, 0.8)',
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
  warningButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F9B06B',
  },
  warningButtonText: {
    color: '#442103',
    fontFamily: fontHeading,
    fontSize: 13,
  },
  exportHint: {
    color: '#83B4A8',
    fontFamily: fontBody,
    fontSize: 11,
  },
  widgetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  widgetCard: {
    width: '48%',
    minHeight: 104,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#33534D',
    backgroundColor: 'rgba(12, 32, 28, 0.95)',
    padding: 10,
    gap: 6,
  },
  widgetCardStale: {
    opacity: 0.72,
  },
  widgetLabel: {
    color: '#8EC4B5',
    fontFamily: fontBody,
    fontSize: 12,
  },
  widgetValue: {
    color: '#F3FFF9',
    fontFamily: fontHeading,
    fontSize: 17,
  },
  widgetMeta: {
    color: '#759A90',
    fontFamily: fontBody,
    fontSize: 11,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#19332E',
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
  hvSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4A5754',
    backgroundColor: '#2E2E2E',
    minHeight: 96,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  hvCellTileWarning: {
    borderColor: '#8D4D41',
    backgroundColor: '#242424',
  },
  hvCellValue: {
    color: '#F0F1F1',
    fontFamily: fontHeading,
    fontSize: 40,
  },
  hvCellName: {
    color: '#C9CED0',
    fontFamily: fontBody,
    fontSize: 28,
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
    minHeight: 196,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
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
    marginTop: 4,
  },
  pagerButton: {
    width: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#145D86',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerButtonDisabled: {
    opacity: 0.38,
  },
  pagerButtonText: {
    color: '#E4F5FF',
    fontFamily: fontHeading,
    fontSize: 16,
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
    flexBasis: '48%',
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
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
  rawLine: {
    color: '#D5ECE4',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
    paddingVertical: 1,
  },
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C4A44',
    backgroundColor: 'rgba(5, 16, 14, 0.95)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    gap: 6,
  },
  tabItem: {
    flexGrow: 1,
    minWidth: '18%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  tabItemActive: {
    backgroundColor: '#1D3E38',
    borderWidth: 1,
    borderColor: '#4E8177',
  },
  tabItemText: {
    color: '#7BA79C',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  tabItemTextActive: {
    color: '#E3FFF6',
    fontFamily: fontHeading,
    fontSize: 12,
  },
  dimText: {
    color: '#7FA59B',
    fontFamily: fontBody,
    fontSize: 12,
  },
  buttonPressed: {
    opacity: 0.78,
  },
});
