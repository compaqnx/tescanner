import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatCanId } from '../../lib/can/rawTraffic';
import { localizeTelemetryError } from '../../lib/i18n/localization';
import { labelFor } from '../../lib/systems/readSignals';
import { SYSTEM_BY_ID } from '../../lib/systems/systemCatalog';
import { useApp } from '../../state/AppContext';
import { Button, ButtonRow, Card, EmptyState, Hint, Screen, Segmented } from '../../ui/components';
import { colors, fonts, radius, spacing, TOUCH_TARGET } from '../../ui/theme';

type Tab = 'alerts' | 'events' | 'raw' | 'console' | 'explorer';

/** Read-only adapter queries that are safe at any time (no vehicle traffic). */
const QUICK_COMMANDS = ['ATI', 'ATRV', 'ATDP', 'STI', 'ATCS'];

export default function DiagnosticsScreen() {
  const app = useApp();
  const { t, locale, alerts, storedErrors, signals, isConnected, isStreaming } = app;
  const [tab, setTab] = useState<Tab>('alerts');

  return (
    <Screen title={t('tabDiagnostics')}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'alerts', label: t('diagAlerts'), icon: 'alert-outline', badge: alerts.length },
          { value: 'events', label: t('diagEvents'), icon: 'history', badge: storedErrors.length },
          { value: 'raw', label: t('diagRaw'), icon: 'barcode-scan' },
          { value: 'console', label: t('diagConsole'), icon: 'console-line' },
          { value: 'explorer', label: t('diagExplorer'), icon: 'magnify' },
        ]}
      />

      {tab === 'alerts' ? (
        <Card title={t('diagAlerts')} icon="alert-outline" iconColor={alerts.length ? colors.danger : colors.live}>
          {alerts.length === 0 ? (
            <EmptyState icon="check-circle-outline" text={t('liveNoAlerts')} />
          ) : (
            alerts.map((alert) => {
              const system = SYSTEM_BY_ID[alert.systemId];
              return (
                <View key={alert.key} style={styles.row}>
                  <MaterialCommunityIcons name={system.icon} size={20} color={system.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{labelFor(alert.label, locale)}</Text>
                    <Text style={styles.rowMeta}>{labelFor(system.title, locale)}</Text>
                  </View>
                  <Text style={styles.alertValue}>
                    {alert.text} {alert.unit}
                  </Text>
                  <Button
                    compact
                    variant="ghost"
                    icon="chevron-right"
                    label={labelFor(system.short, locale)}
                    onPress={() => router.navigate(`/systems/${alert.systemId}`, { withAnchor: true })}
                  />
                </View>
              );
            })
          )}
        </Card>
      ) : null}

      {tab === 'events' ? (
        <Card
          title={t('errorsStoredCount', { count: storedErrors.length })}
          icon="history"
          right={
            <Button compact variant="ghost" icon="delete-outline" label={t('actionClearErrors')} onPress={app.clearStoredErrors} />
          }
        >
          {storedErrors.length === 0 ? (
            <EmptyState text={t('errorsNoneStored')} />
          ) : (
            storedErrors.map((entry) => (
              <View key={entry.id} style={styles.row}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{entry.message}</Text>
                  <Text style={styles.rowMeta}>
                    {t('errorLoggedAt', { time: new Date(entry.createdAt).toLocaleTimeString() })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>
      ) : null}

      {tab === 'raw' ? <RawCanPanel isStreaming={isStreaming} /> : null}

      {tab === 'console' ? <ConsolePanel isConnected={isConnected} isStreaming={isStreaming} /> : null}

      {tab === 'explorer' ? <ExplorerPanel signals={signals} /> : null}
    </Screen>
  );
}

type RawView = 'lines' | 'ids';

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function shortMessageName(name: string | null): string {
  // DBC names look like "ID3D2TotalChargeDischarge"; the id is shown separately.
  return name ? name.replace(/^ID[0-9A-F]{3}/, '') || name : '';
}

/**
 * Raw adapter traffic: every line received while streaming (frames and adapter
 * messages such as BUFFER FULL or ?), plus a per-id summary with message names
 * from the loaded DBC. Adapter messages are highlighted so a stream that
 * receives data but decodes nothing is easy to diagnose.
 */
function RawCanPanel({ isStreaming }: { isStreaming: boolean }) {
  const { t, recentRawFrames, rawIdStats, rawCounters, frameCount } = useApp();
  const [view, setView] = useState<RawView>('lines');

  const hasLines = recentRawFrames.length > 0;
  const noFrames = rawCounters.lines > 0 && rawIdStats.length === 0;

  return (
    <Card title={t('sectionRawCan')} icon="barcode-scan">
      <Segmented<RawView>
        value={view}
        onChange={setView}
        options={[
          { value: 'lines', label: t('rawViewLines'), icon: 'format-list-text' },
          { value: 'ids', label: t('rawViewIds'), icon: 'identifier', badge: rawIdStats.length },
        ]}
      />

      {rawCounters.lines > 0 ? (
        <Text style={styles.rowMeta}>
          {t('rawStats', {
            lines: rawCounters.lines,
            frames: frameCount,
            ids: rawIdStats.length,
            unparsed: rawCounters.unparsed,
          })}
        </Text>
      ) : null}

      {noFrames ? <Hint>{t('rawNoFramesHint')}</Hint> : null}

      {!hasLines ? (
        <EmptyState text={isStreaming ? t('waitingTraffic') : t('rawIdleHint')} />
      ) : view === 'lines' ? (
        <View style={styles.terminal}>
          {recentRawFrames.map((entry) =>
            entry.id === null ? (
              <Text key={entry.seq} style={styles.monoWarn} numberOfLines={1}>
                {formatClock(entry.timestamp)}  {entry.line}  · {t('rawNotFrame')}
              </Text>
            ) : (
              <Text key={entry.seq} style={styles.mono} numberOfLines={1}>
                <Text style={styles.monoDim}>{formatClock(entry.timestamp)}  </Text>
                <Text style={styles.monoId}>{formatCanId(entry.id)}</Text>
                {'  '}
                {entry.dataHex}
                {entry.messageName ? <Text style={styles.monoDim}>  {shortMessageName(entry.messageName)}</Text> : null}
              </Text>
            ),
          )}
        </View>
      ) : rawIdStats.length === 0 ? (
        <EmptyState text={t('waitingTraffic')} />
      ) : (
        <View style={styles.terminal}>
          {rawIdStats.map((stat) => (
            <View key={stat.id} style={styles.rawIdRow}>
              <Text style={styles.monoId}>{formatCanId(stat.id)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={stat.changed ? styles.monoChanged : styles.mono} numberOfLines={1}>
                  {stat.lastDataHex}
                </Text>
                {stat.messageName ? (
                  <Text style={styles.monoDim} numberOfLines={1}>
                    {shortMessageName(stat.messageName)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.monoDim}>{t('rawIdCount', { count: stat.count })}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function ConsolePanel({ isConnected, isStreaming }: { isConnected: boolean; isStreaming: boolean }) {
  const { t, locale, sendAtCommand } = useApp();
  const [input, setInput] = useState('ATI');
  const [output, setOutput] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const disabled = busy || !isConnected || isStreaming;

  const send = async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }
    setBusy(true);
    try {
      const lines = await sendAtCommand(trimmed);
      setOutput((current) => [`> ${trimmed}`, ...(lines.length > 0 ? lines : [t('commandEmptyResponse')]), ...current].slice(0, 200));
    } catch (commandError) {
      const message = commandError instanceof Error ? commandError.message : String(commandError);
      setOutput((current) => [`> ${trimmed}`, `${t('commandErrorPrefix')}: ${localizeTelemetryError(locale, message) ?? message}`, ...current]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('sectionManualCommands')} icon="console-line">
      <View style={styles.scope}>
        <MaterialCommunityIcons name="information-outline" size={16} color={colors.info} />
        <Text style={styles.scopeText}>{t('consoleScope')}</Text>
      </View>
      {!isConnected ? <Hint>{t('commandRequiresAdapter')}</Hint> : null}
      {isStreaming ? <Hint>{t('commandBlockedWhileStreaming')}</Hint> : null}

      <Text style={styles.subLabel}>{t('consoleQuick')}</Text>
      <ButtonRow>
        {QUICK_COMMANDS.map((command) => (
          <Button key={command} compact variant="secondary" label={command} disabled={disabled} onPress={() => send(command)} />
        ))}
      </ButtonRow>

      <View style={styles.commandRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          style={[styles.input, styles.inputFlex]}
          placeholder={t('commandPlaceholder')}
          placeholderTextColor={colors.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <Button icon="send" label={t('actionSend')} busy={busy} disabled={disabled} onPress={() => send(input)} />
      </View>

      {output.length > 0 ? (
        <View style={styles.terminal}>
          {output.map((line, index) => (
            <Text key={`${line}-${index}`} style={[styles.mono, line.startsWith('>') && { color: colors.neon }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ExplorerPanel({ signals }: { signals: ReturnType<typeof useApp>['signals'] }) {
  const { t } = useApp();
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = needle
      ? signals.filter((signal) => `${signal.signalName} ${signal.label} ${signal.messageName}`.toLowerCase().includes(needle))
      : signals;
    return matches.slice(0, 200);
  }, [filter, signals]);

  return (
    <Card title={t('sectionSignalExplorer')} icon="magnify" subtitle={t('explorerCount', { shown: rows.length, total: signals.length })}>
      <TextInput
        value={filter}
        onChangeText={setFilter}
        style={styles.input}
        placeholder={t('signalSearchPlaceholder')}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {rows.length === 0 ? (
        <EmptyState text={signals.length === 0 ? t('watchedEmpty') : t('noSignalMatches')} />
      ) : (
        rows.map((signal) => (
          <View key={signal.key} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{signal.watched ? signal.label : signal.signalName}</Text>
              <Text style={styles.rowMetaMono}>
                0x{signal.messageId.toString(16).toUpperCase()} · {signal.messageName}
              </Text>
            </View>
            <Text style={styles.value}>{signal.displayValue}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    minHeight: TOUCH_TARGET,
  },
  rowTitle: { color: colors.text, fontFamily: fonts.body, fontSize: 14 },
  rowMeta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  rowMetaMono: { color: colors.textDim, fontFamily: fonts.mono, fontSize: 10 },
  value: { color: colors.text, fontFamily: fonts.heading, fontSize: 14, maxWidth: '45%', textAlign: 'right' },
  alertValue: { color: colors.danger, fontFamily: fonts.heading, fontSize: 15 },
  terminal: { backgroundColor: '#0A0B0B', borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  mono: { color: '#B8E0D2', fontFamily: fonts.mono, fontSize: 11 },
  monoDim: { color: colors.textDim, fontFamily: fonts.mono, fontSize: 10 },
  monoId: { color: colors.info, fontFamily: fonts.mono, fontSize: 11 },
  monoWarn: { color: colors.warn, fontFamily: fonts.mono, fontSize: 11 },
  monoChanged: { color: colors.neon, fontFamily: fonts.mono, fontSize: 11 },
  rawIdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  scope: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#12202E',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  scopeText: { color: '#CFE4F5', fontFamily: fonts.body, fontSize: 12, flex: 1, lineHeight: 17 },
  subLabel: { color: colors.textMuted, fontFamily: fonts.heading, fontSize: 12 },
  commandRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  inputFlex: { flex: 1 },
  input: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
});
