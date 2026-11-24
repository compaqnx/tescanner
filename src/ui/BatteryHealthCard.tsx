import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pickHvCellSignals } from '../lib/hv/hvSignalCatalog';
import { computeBatteryHealth, type FactorState, type SohVerdict } from '../lib/systems/batteryHealth';
import { labelFor } from '../lib/systems/readSignals';
import type { Label } from '../lib/systems/systemCatalog';
import { useApp } from '../state/AppContext';
import { Card } from './components';
import type { IconName } from './icons';
import { colors, fonts, radius, spacing, themed } from './theme';

const L = (en: string, ro: string): Label => ({ en, ro });

const VERDICT_TEXT: Record<SohVerdict, Label> = {
  excellent: L('Excellent', 'Excelenta'),
  good: L('Good', 'Buna'),
  fair: L('Fair', 'Acceptabila'),
  poor: L('Poor', 'Slaba'),
  check: L('Check required', 'Necesita verificare'),
  unknown: L('Waiting for BMS data', 'Se asteapta date BMS'),
};

function verdictColor(verdict: SohVerdict): string {
  switch (verdict) {
    case 'excellent':
    case 'good':
      return colors.live;
    case 'fair':
      return colors.warn;
    case 'poor':
    case 'check':
      return colors.danger;
    default:
      return colors.textDim;
  }
}

const FACTOR_ICON: Record<FactorState, IconName> = {
  good: 'check-circle',
  watch: 'alert-circle',
  bad: 'close-circle',
  info: 'information',
  missing: 'circle-outline',
};

function factorColor(state: FactorState): string {
  switch (state) {
    case 'good':
      return colors.live;
    case 'watch':
      return colors.warn;
    case 'bad':
      return colors.danger;
    case 'info':
      return colors.info;
    default:
      return colors.textDim;
  }
}

// Gauge zones (SOH %): the scale starts at 50 so the useful range has room.
const GAUGE_MIN = 50;
const ZONES: Array<{ from: number; to: number; color: () => string }> = [
  { from: 50, to: 70, color: () => colors.danger },
  { from: 70, to: 80, color: () => colors.warn },
  { from: 80, to: 90, color: () => colors.live },
  { from: 90, to: 100, color: () => colors.live },
];

function toGauge(soh: number): number {
  return Math.max(0, Math.min(100, ((soh - GAUGE_MIN) / (100 - GAUGE_MIN)) * 100));
}

/**
 * Battery state-of-health verdict for the Live screen: the capacity-retention
 * number on a graded scale, a plain-language verdict, and the factors behind it.
 */
export function BatteryHealthCard() {
  const { locale, signals, signalIndex, packReferenceKwh } = useApp();
  const cells = useMemo(() => pickHvCellSignals(signals), [signals]);
  const health = useMemo(
    () => computeBatteryHealth({ index: signalIndex, cells, userReferenceKwh: packReferenceKwh }),
    [cells, packReferenceKwh, signalIndex],
  );
  const lbl = (label: Label) => labelFor(label, locale);
  const color = verdictColor(health.verdict);

  return (
    <Card
      title={lbl(L('Battery health', 'Sanatate baterie'))}
      icon="battery-heart-variant"
      iconColor={color}
      onPress={() => router.navigate('/systems/cells')}
      right={<MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />}
    >
      <View style={styles.head}>
        <View style={styles.sohBlock}>
          <Text style={[styles.soh, { color }]}>{health.soh === null ? '--' : health.soh.toFixed(0)}</Text>
          <Text style={styles.sohUnit}>% SOH</Text>
        </View>
        <View style={[styles.verdict, { borderColor: color, backgroundColor: `${color}1F` }]}>
          <Text style={[styles.verdictText, { color }]}>{lbl(VERDICT_TEXT[health.verdict])}</Text>
        </View>
      </View>

      <View style={styles.gauge}>
        {ZONES.map((zone) => (
          <View
            key={zone.from}
            style={[
              styles.zone,
              { flex: zone.to - zone.from, backgroundColor: zone.color(), opacity: zone.from >= 90 ? 1 : 0.55 },
            ]}
          />
        ))}
        {health.soh !== null ? (
          <View style={[styles.marker, { left: `${toGauge(health.soh)}%` }]}>
            <View style={[styles.markerLine, { backgroundColor: colors.text }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.scale}>
        {[50, 70, 80, 90, 100].map((mark) => (
          <Text
            key={mark}
            style={[
              styles.scaleText,
              mark === 100 ? { right: 0 } : { left: `${toGauge(mark)}%`, marginLeft: mark === 50 ? 0 : -8 },
            ]}
          >
            {mark}
          </Text>
        ))}
      </View>

      {health.verdictReason ? <Text style={styles.reason}>{lbl(health.verdictReason)}</Text> : null}

      {health.factors.map((factor) => (
        <View key={factor.id} style={styles.factor}>
          <MaterialCommunityIcons name={FACTOR_ICON[factor.state]} size={18} color={factorColor(factor.state)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.factorLabel}>{lbl(factor.label)}</Text>
            {factor.detail ? <Text style={styles.factorDetail}>{lbl(factor.detail)}</Text> : null}
          </View>
          <Text style={[styles.factorValue, !factor.value && { color: colors.textDim }]} numberOfLines={1}>
            {factor.value ?? '--'}
          </Text>
        </View>
      ))}

      <Text style={styles.footnote}>
        {lbl(
          L(
            'SOH = the BMS capacity estimate vs. the pack when new. It settles after full charge/discharge cycles; a single reading can be a few % off.',
            'SOH = estimarea de capacitate a BMS fata de pachetul nou. Se stabilizeaza dupa cicluri complete; o singura citire poate varia cu cateva %.',
          ),
        )}
      </Text>
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    sohBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    soh: { fontFamily: fonts.heading, fontSize: 48, lineHeight: 54 },
    sohUnit: { color: colors.textMuted, fontFamily: fonts.heading, fontSize: 16 },
    verdict: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    verdictText: { fontFamily: fonts.heading, fontSize: 15 },
    // No gap between zones, so zone widths stay exactly proportional to the scale.
    gauge: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'visible', marginTop: spacing.xs },
    zone: { height: 10, borderRadius: 3 },
    marker: { position: 'absolute', top: -5, bottom: -5, width: 0, alignItems: 'center' },
    markerLine: { width: 4, height: 20, borderRadius: 2 },
    scale: { height: 14 },
    scaleText: { position: 'absolute', color: colors.textDim, fontFamily: fonts.body, fontSize: 10 },
    reason: { color: colors.warn, fontFamily: fonts.body, fontSize: 12 },
    factor: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    factorLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 14 },
    factorDetail: { color: colors.textDim, fontFamily: fonts.body, fontSize: 11, lineHeight: 15 },
    factorValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 13, maxWidth: '50%', textAlign: 'right' },
    footnote: { color: colors.textDim, fontFamily: fonts.body, fontSize: 11, lineHeight: 15 },
  }),
);
