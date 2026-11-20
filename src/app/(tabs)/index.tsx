import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SYSTEMS, findSignalSpec, type SystemId } from '../../lib/systems/systemCatalog';
import { labelFor, readSignal } from '../../lib/systems/readSignals';
import { detectTeslaModel, TESLA_MODEL_IMAGES } from '../../lib/vehicle/modelDetection';
import { useApp } from '../../state/AppContext';
import {
  Button,
  ButtonRow,
  Card,
  EmptyState,
  Grid,
  Hint,
  MetricTile,
  PowerBar,
  Screen,
  SectionLabel,
  tileWidth,
  useColumns,
} from '../../ui/components';
import { colors, fonts, radius, spacing } from '../../ui/theme';

/** Reads one catalog value by system + id. */
function useReading(systemId: SystemId, signalId: string) {
  const { signalIndex } = useApp();
  return useMemo(() => {
    const spec = findSignalSpec(systemId, signalId);
    return spec ? readSignal(spec, signalIndex) : null;
  }, [signalIndex, signalId, systemId]);
}

export default function LiveScreen() {
  const app = useApp();
  const { t, locale, signalIndex, alerts, isConnected, isStreaming, status, actionBusy, runAction } = app;
  const { columns, width, isLandscape } = useColumns(160);

  const speed = useReading('propulsion', 'speed');
  const power = useReading('ess', 'packPower');
  const soc = useReading('ess', 'soc');
  const packV = useReading('ess', 'packVoltage');
  const packA = useReading('ess', 'packCurrent');
  const cellDelta = useReading('ess', 'cellDelta');
  const lv = useReading('control', 'lvVoltage');
  const range = useReading('ess', 'idealRange');
  const outside = useReading('thermal', 'outsideTemp');
  const gear = useReading('propulsion', 'gear');

  const model = useMemo(
    () => detectTeslaModel(isConnected, app.selectedVehicleProfileId, app.selectedDevice?.name ?? null, signalIndex),
    [app.selectedDevice?.name, app.selectedVehicleProfileId, isConnected, signalIndex],
  );

  const hasData = app.signals.length > 0;
  const primaryColumns = isLandscape ? 3 : 1;
  const primaryWidth = tileWidth(primaryColumns, width);
  const secondaryWidth = tileWidth(columns, width);
  const systemColumns = Math.max(2, Math.min(3, columns));
  const systemWidth = tileWidth(systemColumns, width);

  const powerKw = power?.value ?? null;
  const powerLabel = powerKw !== null && powerKw < 0 ? t('liveRegen') : t('liveDrive');

  return (
    <Screen title={t('appTitle')} subtitle={t(model.nameKey)}>
      {!isStreaming && !hasData ? (
        <Card>
          <View style={[styles.hero, isLandscape && styles.heroLandscape]}>
            <Image source={TESLA_MODEL_IMAGES[model.key]} style={styles.heroImage} resizeMode="contain" />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={styles.heroTitle}>{t('liveIdleTitle')}</Text>
              <Hint>{t('liveIdleHint')}</Hint>
              <ButtonRow>
                {status === 'connected' ? (
                  <Button
                    icon="play"
                    label={t('actionStartStream')}
                    busy={actionBusy === 'stream-start'}
                    onPress={() => runAction('stream-start', app.startStreaming)}
                  />
                ) : (
                  <Button icon="bluetooth-connect" label={t('connFindAdapter')} onPress={() => router.navigate('/setup')} />
                )}
                <Button variant="secondary" icon="car-cog" label={t('tabSystems')} onPress={() => router.navigate('/systems')} />
              </ButtonRow>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Primary glance values: large type, readable at arm's length. */}
      <Grid>
        <View style={[styles.primaryTile, { width: primaryWidth }]}>
          <Text style={styles.primaryLabel}>{t('liveSpeed')}</Text>
          <View style={styles.primaryRow}>
            <Text style={styles.primaryValue} adjustsFontSizeToFit numberOfLines={1}>
              {speed?.text ?? '--'}
            </Text>
            <Text style={styles.primaryUnit}>km/h</Text>
            {gear && gear.value !== null ? <Text style={styles.gear}>{gear.text}</Text> : null}
          </View>
        </View>
        <View style={[styles.primaryTile, { width: primaryWidth }]}>
          <Text style={styles.primaryLabel}>
            {t('livePower')} · {powerLabel}
          </Text>
          <View style={styles.primaryRow}>
            <Text
              style={[styles.primaryValue, { color: powerKw !== null && powerKw < 0 ? colors.regen : colors.neon }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {power?.text ?? '--'}
            </Text>
            <Text style={styles.primaryUnit}>kW</Text>
          </View>
          <PowerBar kw={powerKw} />
        </View>
        <View style={[styles.primaryTile, { width: primaryWidth }]}>
          <Text style={styles.primaryLabel}>{t('liveSoc')}</Text>
          <View style={styles.primaryRow}>
            <Text style={[styles.primaryValue, soc?.warn && { color: colors.danger }]} adjustsFontSizeToFit numberOfLines={1}>
              {soc?.text ?? '--'}
            </Text>
            <Text style={styles.primaryUnit}>%</Text>
          </View>
          <View style={styles.socTrack}>
            <View style={[styles.socFill, { width: `${Math.max(0, Math.min(100, soc?.value ?? 0))}%` }]} />
          </View>
        </View>
      </Grid>

      <Grid>
        <MetricTile width={secondaryWidth} label={t('livePackVoltage')} value={packV?.text ?? '--'} unit="V" onPress={() => router.navigate('/systems/ess', { withAnchor: true })} />
        <MetricTile width={secondaryWidth} label={t('dashboardWidgetPackCurrent')} value={packA?.text ?? '--'} unit="A" onPress={() => router.navigate('/systems/ess', { withAnchor: true })} />
        <MetricTile width={secondaryWidth} label={t('liveCellDelta')} value={cellDelta?.text ?? '--'} unit="mV" warn={cellDelta?.warn} onPress={() => router.navigate('/systems/cells', { withAnchor: true })} />
        <MetricTile width={secondaryWidth} label={t('live12v')} value={lv?.text ?? '--'} unit="V" warn={lv?.warn} onPress={() => router.navigate('/systems/control', { withAnchor: true })} />
        <MetricTile width={secondaryWidth} label={t('dashboardWidgetIdealRange')} value={range?.text ?? '--'} unit="km" />
        <MetricTile width={secondaryWidth} label={labelFor(outside?.spec.label ?? { en: 'Outside', ro: 'Exterior' }, locale)} value={outside?.text ?? '--'} unit="°C" />
      </Grid>

      <Card
        title={t('liveAlertsTitle')}
        icon="alert-outline"
        iconColor={alerts.length > 0 ? colors.danger : colors.live}
        onPress={() => router.navigate('/diagnostics')}
        right={<MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />}
      >
        {alerts.length === 0 ? (
          <EmptyState icon="check-circle-outline" text={t('liveNoAlerts')} />
        ) : (
          alerts.slice(0, 3).map((alert) => (
            <View key={alert.key} style={styles.alertRow}>
              <MaterialCommunityIcons name={alert.kind === 'low' ? 'arrow-down-bold' : 'arrow-up-bold'} size={16} color={colors.danger} />
              <Text style={styles.alertLabel} numberOfLines={1}>
                {labelFor(alert.label, locale)}
              </Text>
              <Text style={styles.alertValue}>
                {alert.text} {alert.unit}
              </Text>
            </View>
          ))
        )}
      </Card>

      <SectionLabel>{t('liveSystemsTitle')}</SectionLabel>
      <Grid>
        {SYSTEMS.map((system) => {
          const kpis = app.systemSummaries[system.id].kpis.slice(0, 2);
          const coverage = app.systemSummaries[system.id].coverage;
          return (
            <Pressable
              key={system.id}
              accessibilityRole="button"
              accessibilityLabel={labelFor(system.title, locale)}
              onPress={() => router.navigate(`/systems/${system.id}`, { withAnchor: true })}
              style={({ pressed }) => [styles.systemTile, { width: systemWidth }, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.systemHead}>
                <MaterialCommunityIcons name={system.icon} size={20} color={system.accent} />
                <Text style={styles.systemName} numberOfLines={1}>
                  {labelFor(system.short, locale)}
                </Text>
                {coverage.warnings > 0 ? <View style={styles.warnDot} /> : null}
              </View>
              {kpis.map((kpi) => (
                <View key={kpi.spec.id} style={styles.systemKpi}>
                  <Text style={styles.systemKpiLabel} numberOfLines={1}>
                    {labelFor(kpi.spec.label, locale)}
                  </Text>
                  <Text style={[styles.systemKpiValue, kpi.warn && { color: colors.danger }]} numberOfLines={1}>
                    {kpi.text}
                    {kpi.unit && kpi.value !== null ? ` ${kpi.unit}` : ''}
                  </Text>
                </View>
              ))}
              <Text style={styles.coverage}>
                {t('systemsCoverage', { available: coverage.available, total: coverage.total })}
              </Text>
            </Pressable>
          );
        })}
      </Grid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md },
  heroLandscape: { flexDirection: 'row', alignItems: 'center' },
  heroImage: { width: '100%', maxWidth: 360, height: 140, alignSelf: 'center' },
  heroTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 18 },

  primaryTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  primaryLabel: { color: colors.textMuted, fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.4 },
  primaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  primaryValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 56, lineHeight: 64, flexShrink: 1 },
  primaryUnit: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 16 },
  gear: {
    marginLeft: 'auto',
    color: colors.neon,
    fontFamily: fonts.heading,
    fontSize: 22,
  },
  socTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  socFill: { height: '100%', backgroundColor: colors.live, borderRadius: 5 },

  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  alertLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 14, flex: 1 },
  alertValue: { color: colors.danger, fontFamily: fonts.heading, fontSize: 14 },

  systemTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 120,
  },
  systemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  systemName: { color: colors.text, fontFamily: fonts.heading, fontSize: 15, flex: 1 },
  warnDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  systemKpi: { gap: 0 },
  systemKpiLabel: { color: colors.textDim, fontFamily: fonts.body, fontSize: 11 },
  systemKpiValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 17 },
  coverage: { color: colors.textDim, fontFamily: fonts.body, fontSize: 11, marginTop: 'auto' },
});
