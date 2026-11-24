import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { findSignalSpec } from '../../../lib/systems/systemCatalog';
import { readSignal } from '../../../lib/systems/readSignals';
import { useApp } from '../../../state/AppContext';
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
} from '../../../ui/components';
import { colors, fonts, spacing, themed } from '../../../ui/theme';

type Phase = 'idle' | 'armed' | 'running' | 'done';

/** Split targets in km/h; 96.6 km/h = 60 mph. */
const SPLITS = [50, 96.6, 100];
const FINAL_TARGET = 100;
const LAUNCH_THRESHOLD_KMH = 0.5;

interface RunState {
  phase: Phase;
  startedAt: number | null;
  splits: Record<string, number>;
  peakKw: number;
}

const INITIAL: RunState = { phase: 'idle', startedAt: null, splits: {}, peakKw: 0 };

/**
 * Calculated feature (no vehicle write): times 0–50 / 0–60 mph / 0–100 km/h
 * from the decoded vehicle-speed signal timestamps.
 */
export default function PerformanceScreen() {
  const app = useApp();
  const { t, signalIndex, actionBusy, runAction } = app;
  const { columns, width } = useColumns(150, 4);
  const [run, setRun] = useState<RunState>(INITIAL);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const speed = useMemo(() => {
    const spec = findSignalSpec('propulsion', 'speed');
    return spec ? readSignal(spec, signalIndex) : null;
  }, [signalIndex]);
  const power = useMemo(() => {
    const spec = findSignalSpec('propulsion', 'drivePower');
    return spec ? readSignal(spec, signalIndex) : null;
  }, [signalIndex]);

  const speedValue = speed?.value ?? null;
  const speedAt = speed?.updatedAt ?? null;
  const powerValue = power?.value ?? null;

  useEffect(() => {
    const current = runRef.current;
    if (speedValue === null || speedAt === null) {
      return;
    }

    if (current.phase === 'armed' && speedValue > LAUNCH_THRESHOLD_KMH) {
      setRun({ ...current, phase: 'running', startedAt: speedAt });
      return;
    }

    if (current.phase === 'running' && current.startedAt !== null) {
      const elapsed = (speedAt - current.startedAt) / 1000;
      const splits = { ...current.splits };
      for (const target of SPLITS) {
        const key = String(target);
        if (splits[key] === undefined && speedValue >= target) {
          splits[key] = elapsed;
        }
      }
      const peakKw = Math.max(current.peakKw, powerValue ?? 0);
      const finished = speedValue >= FINAL_TARGET;
      setRun({ ...current, splits, peakKw, phase: finished ? 'done' : 'running' });
    }
  }, [powerValue, speedAt, speedValue]);

  const tile = tileWidth(Math.min(columns, 4), width);
  const phaseText: Record<Phase, string> = {
    idle: t('perfIdle'),
    armed: t('perfArmed'),
    running: t('perfRunning'),
    done: t('perfDone'),
  };
  const canArm = speedValue !== null && speedValue <= LAUNCH_THRESHOLD_KMH;

  return (
    <Screen title={t('perfTitle')} back>
      <Hint>{t('perfHint')}</Hint>

      {speedValue === null ? (
        <Card>
          <EmptyState icon="speedometer-slow" text={t('perfNeedsSpeed')} />
          <Button
            icon="target"
            label={t('systemStreamOnly')}
            busy={actionBusy === 'focus-propulsion'}
            disabled={actionBusy !== null}
            onPress={() => runAction('focus-propulsion', () => app.focusSystem('propulsion'))}
          />
        </Card>
      ) : null}

      <Card>
        <View style={styles.status}>
          <Text style={[styles.phase, run.phase === 'running' && { color: colors.neon }, run.phase === 'done' && { color: colors.live }]}>
            {phaseText[run.phase]}
          </Text>
          <Text style={styles.speed}>
            {speed?.text ?? '--'} <Text style={styles.unit}>km/h</Text>
          </Text>
        </View>
        <ButtonRow>
          <Button
            icon="flag-checkered"
            label={t('perfArm')}
            disabled={!canArm || run.phase === 'running'}
            onPress={() => setRun({ ...INITIAL, phase: 'armed' })}
          />
          <Button variant="secondary" icon="restore" label={t('perfReset')} onPress={() => setRun(INITIAL)} />
        </ButtonRow>
      </Card>

      <Grid>
        {SPLITS.map((target) => {
          const value = run.splits[String(target)];
          const label = target === 96.6 ? '0–60 mph' : t('perfTarget', { target });
          return (
            <MetricTile
              key={target}
              width={tile}
              label={label}
              value={value !== undefined ? value.toFixed(2) : '--'}
              unit="s"
              accent={value !== undefined ? colors.live : undefined}
            />
          );
        })}
        <MetricTile width={tile} label={t('perfPeakPower')} value={run.peakKw > 0 ? run.peakKw.toFixed(0) : '--'} unit="kW" />
      </Grid>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  phase: { color: colors.textMuted, fontFamily: fonts.heading, fontSize: 16, flex: 1 },
  speed: { color: colors.text, fontFamily: fonts.heading, fontSize: 40 },
  unit: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },
  }),
);
