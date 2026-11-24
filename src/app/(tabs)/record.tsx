import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../state/AppContext';
import {
  Button,
  ButtonRow,
  Card,
  EmptyState,
  Grid,
  Hint,
  MetricTile,
  Screen,
  tileWidth,
  useColumns,
  useElapsed,
} from '../../ui/components';
import { colors, fonts, spacing, TOUCH_TARGET, themed } from '../../ui/theme';

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${s}s` : `${s}s`;
}

/**
 * Recording is the stream: every streamed frame and decoded signal is written
 * to SQLite, so starting the stream is starting a recording. Sessions are kept
 * for export (CSV, shared through the OS share sheet).
 */
export default function RecordScreen() {
  const app = useApp();
  const { t, status, isStreaming, isConnected, actionBusy, runAction, frameCount, signalCount, recentSessions, lastExportUri } = app;
  const elapsed = useElapsed(isStreaming ? app.streamStartedAt : null);
  const { columns, width } = useColumns(150, 3);
  const tile = tileWidth(Math.min(3, columns), width);

  return (
    <Screen title={t('recordTitle')} subtitle={t('recordHint')}>
      <Card>
        <View style={styles.recordHead}>
          <View style={[styles.recDot, isStreaming && styles.recDotLive]} />
          <Text style={styles.recTime}>{elapsed}</Text>
        </View>
        {isStreaming ? (
          <Button
            variant="danger"
            icon="stop"
            label={t('recordStop')}
            busy={actionBusy === 'stream-stop'}
            onPress={() => runAction('stream-stop', app.stopStreaming)}
            style={styles.bigButton}
          />
        ) : (
          <Button
            icon="record-rec"
            label={t('recordStart')}
            busy={actionBusy === 'stream-start'}
            disabled={status !== 'connected' || actionBusy !== null}
            onPress={() => runAction('stream-start', app.startStreaming)}
            style={styles.bigButton}
          />
        )}
        {!isConnected ? <Hint>{t('recordNeedsAdapter')}</Hint> : null}
      </Card>

      <Grid>
        <MetricTile width={tile} label={t('recordElapsed')} value={elapsed} />
        <MetricTile width={tile} label={t('counterFrames')} value={String(frameCount)} />
        <MetricTile width={tile} label={t('counterSignals')} value={String(signalCount)} />
      </Grid>

      <Card
        title={t('recordSessions')}
        icon="database-outline"
        right={
          <Button
            compact
            variant="ghost"
            icon="refresh"
            label={t('recordRefresh')}
            onPress={() => runAction('sessions-refresh', app.refreshSessions)}
          />
        }
      >
        {recentSessions.length === 0 ? (
          <EmptyState icon="database-off-outline" text={t('recordNoSessions')} />
        ) : (
          recentSessions.map((session) => {
            const busy = actionBusy === `export-${session.sessionId}`;
            return (
              <View key={session.sessionId} style={styles.sessionRow}>
                <MaterialCommunityIcons name="file-chart-outline" size={22} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionTitle}>{new Date(session.startedAt).toLocaleString()}</Text>
                  <Text style={styles.sessionMeta}>
                    {formatDuration(session.endedAt - session.startedAt)} · {t('recordFrames', { count: session.frameCount })} ·{' '}
                    {t('recordSignalsShort', { count: session.signalCount })}
                  </Text>
                </View>
                <Button
                  compact
                  variant="secondary"
                  icon="share-variant-outline"
                  label="CSV"
                  busy={busy}
                  disabled={actionBusy !== null && !busy}
                  onPress={() => app.exportWithFeedback(session.sessionId)}
                />
              </View>
            );
          })
        )}
        <ButtonRow>
          <Button
            variant="secondary"
            icon="file-export-outline"
            label={t('recordLatest')}
            busy={actionBusy === 'export'}
            disabled={actionBusy !== null}
            onPress={() => app.exportWithFeedback()}
          />
        </ButtonRow>
        {lastExportUri ? (
          <Text style={styles.sessionMeta} numberOfLines={1}>
            {t('recordExported', { uri: lastExportUri })}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  recordHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'center' },
  recDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textDim },
  recDotLive: { backgroundColor: colors.danger },
  recTime: { color: colors.text, fontFamily: fonts.heading, fontSize: 44 },
  bigButton: { minHeight: TOUCH_TARGET + 12 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sessionTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 14 },
  sessionMeta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  }),
);
