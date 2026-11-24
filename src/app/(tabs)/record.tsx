import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { REPLAY_SPEEDS } from '../../lib/replay/replayEngine';
import { useApp } from '../../state/AppContext';
import {
  Button,
  ButtonRow,
  Card,
  EmptyState,
  formatElapsed,
  Grid,
  Hint,
  MetricTile,
  Screen,
  Segmented,
  tileWidth,
  useColumns,
  useElapsed,
} from '../../ui/components';
import { colors, fonts, radius, spacing, TOUCH_TARGET, themed } from '../../ui/theme';

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${s}s` : `${s}s`;
}

/**
 * Recording is the stream: every streamed frame and decoded signal is written
 * to SQLite, so starting the stream is starting a recording. Sessions are kept
 * for export (CSV, shared through the OS share sheet), replay and deletion.
 */
export default function RecordScreen() {
  const app = useApp();
  const {
    t,
    status,
    isStreaming,
    isConnected,
    actionBusy,
    runAction,
    frameCount,
    signalCount,
    recentSessions,
    lastExportUri,
    replay,
    activeSessionId,
  } = app;
  const elapsed = useElapsed(isStreaming ? app.streamStartedAt : null);
  const { columns, width } = useColumns(150, 3);
  const tile = tileWidth(Math.min(3, columns), width);

  const replaying = replay.status !== 'idle';
  const replaySession = replaying ? recentSessions.find((entry) => entry.sessionId === replay.sessionId) : undefined;
  const progress = replay.durationMs > 0 ? Math.min(1, replay.positionMs / replay.durationMs) : 0;

  const confirmDelete = (sessionId: string, startedAt: number, frames: number) => {
    Alert.alert(
      t('recordDeleteTitle'),
      t('recordDeleteBody', { date: new Date(startedAt).toLocaleString(), frames }),
      [
        { text: t('recordDeleteCancel'), style: 'cancel' },
        {
          text: t('recordDeleteConfirm'),
          style: 'destructive',
          onPress: () => {
            void runAction(`delete-${sessionId}`, () => app.deleteSession(sessionId));
          },
        },
      ],
    );
  };

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
        {replaying && status === 'connected' ? <Hint>{t('replayLiveReplaces')}</Hint> : null}
      </Card>

      {replaying ? (
        <Card
          title={t('replayTitle')}
          icon="play-box-multiple-outline"
          iconColor={colors.info}
          subtitle={replaySession ? new Date(replaySession.startedAt).toLocaleString() : undefined}
        >
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.trackTimes}>
            <Text style={styles.trackTime}>{formatElapsed(replay.positionMs)}</Text>
            <Text style={styles.replayStatus}>
              {replay.status === 'ended'
                ? t('replayEnded')
                : replay.status === 'paused'
                  ? t('replayPaused')
                  : replay.status === 'error'
                    ? t('replayFailed')
                    : t('replayPlaying')}
            </Text>
            <Text style={styles.trackTime}>{formatElapsed(replay.durationMs)}</Text>
          </View>

          <View style={styles.controls}>
            <Button compact variant="secondary" icon="rewind-10" label="10 s" onPress={() => app.seekReplay(-10_000)} />
            {replay.status === 'playing' ? (
              <Button compact icon="pause" label={t('replayPause')} onPress={app.pauseReplay} />
            ) : replay.status === 'paused' ? (
              <Button compact icon="play" label={t('replayResume')} onPress={app.resumeReplay} />
            ) : (
              <Button compact icon="restart" label={t('replayRestart')} onPress={app.restartReplay} />
            )}
            <Button compact variant="secondary" icon="fast-forward-10" label="10 s" onPress={() => app.seekReplay(10_000)} />
          </View>

          <Segmented<string>
            value={String(replay.speed)}
            onChange={(value) => app.setReplaySpeed(Number(value))}
            options={REPLAY_SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }))}
          />

          <Text style={styles.sessionMeta}>
            {t('replayFrames', { played: replay.framesPlayed, total: replay.totalFrames })}
            {replay.skippedFrames > 0 ? ` · ${t('replaySkipped', { count: replay.skippedFrames })}` : ''}
          </Text>
          {replay.error ? <Text style={styles.errorText}>{replay.error}</Text> : null}
          <Hint>{t('replayHint')}</Hint>

          <ButtonRow>
            {replay.status !== 'ended' ? (
              <Button variant="secondary" icon="restart" label={t('replayRestart')} onPress={app.restartReplay} />
            ) : null}
            <Button
              variant="danger"
              icon="stop"
              label={t('replayStop')}
              busy={actionBusy === 'replay-stop'}
              onPress={() => runAction('replay-stop', app.stopReplay)}
            />
          </ButtonRow>
        </Card>
      ) : null}

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
        {isStreaming ? <Hint>{t('replayBlockedLive')}</Hint> : null}
        {recentSessions.length === 0 ? (
          <EmptyState icon="database-off-outline" text={t('recordNoSessions')} />
        ) : (
          recentSessions.map((session) => {
            const exportBusy = actionBusy === `export-${session.sessionId}`;
            const deleteBusy = actionBusy === `delete-${session.sessionId}`;
            const replayBusy = actionBusy === `replay-${session.sessionId}`;
            const isRecordingNow = session.sessionId === activeSessionId;
            const isReplayingThis = replay.sessionId === session.sessionId;
            return (
              <View key={session.sessionId} style={[styles.sessionRow, isReplayingThis && styles.sessionRowActive]}>
                <MaterialCommunityIcons
                  name={isReplayingThis ? 'play-circle' : isRecordingNow ? 'record-circle' : 'file-chart-outline'}
                  size={22}
                  color={isReplayingThis ? colors.info : isRecordingNow ? colors.danger : colors.textMuted}
                />
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionTitle}>{new Date(session.startedAt).toLocaleString()}</Text>
                  <Text style={styles.sessionMeta}>
                    {formatDuration(session.endedAt - session.startedAt)} · {t('recordFrames', { count: session.frameCount })} ·{' '}
                    {t('recordSignalsShort', { count: session.signalCount })}
                    {isRecordingNow ? ` · ${t('recordRecordingNow')}` : ''}
                  </Text>
                  <View style={styles.sessionActions}>
                    <Button
                      compact
                      variant="secondary"
                      icon="play"
                      label={t('replayPlay')}
                      busy={replayBusy}
                      disabled={isStreaming || isRecordingNow || session.frameCount === 0 || (actionBusy !== null && !replayBusy)}
                      onPress={() => runAction(`replay-${session.sessionId}`, () => app.startReplay(session.sessionId))}
                    />
                    <Button
                      compact
                      variant="secondary"
                      icon="share-variant-outline"
                      label="CSV"
                      busy={exportBusy}
                      disabled={actionBusy !== null && !exportBusy}
                      onPress={() => app.exportWithFeedback(session.sessionId)}
                    />
                    <Button
                      compact
                      variant="ghost"
                      icon="trash-can-outline"
                      label={t('recordDelete')}
                      busy={deleteBusy}
                      disabled={isRecordingNow || (actionBusy !== null && !deleteBusy)}
                      onPress={() => confirmDelete(session.sessionId, session.startedAt, session.frameCount)}
                    />
                  </View>
                </View>
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
    track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
    trackFill: { height: '100%', backgroundColor: colors.info },
    trackTimes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    trackTime: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 12 },
    replayStatus: { color: colors.info, fontFamily: fonts.heading, fontSize: 13 },
    controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 12 },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    sessionRowActive: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingHorizontal: spacing.sm },
    sessionInfo: { flex: 1, gap: spacing.xs },
    sessionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    sessionTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 14 },
    sessionMeta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  }),
);
