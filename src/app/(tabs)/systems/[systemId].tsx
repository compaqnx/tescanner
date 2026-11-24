import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pollTargetServes } from '../../../lib/can/pollPlan';
import { labelFor, readKpis, readSignal } from '../../../lib/systems/readSignals';
import { isSystemId, SYSTEM_BY_ID } from '../../../lib/systems/systemCatalog';
import { useApp } from '../../../state/AppContext';
import {
  AccessBadge,
  Button,
  ButtonRow,
  Card,
  EmptyState,
  Grid,
  Hint,
  MetricTile,
  Screen,
  SignalRow,
  tileWidth,
  useColumns,
} from '../../../ui/components';
import { colors, fonts, spacing, themed } from '../../../ui/theme';

/**
 * One EV system: headline KPIs, stream controls scoped to this system, then
 * one card per subsystem (pack, BMS, contactors, inverters, OBC, …).
 */
export default function SystemScreen() {
  const { systemId } = useLocalSearchParams<{ systemId: string }>();
  const app = useApp();
  const { t, locale, signalIndex, pollCatalog, disabledPollIds, canFilterEnabled, actionBusy, runAction, isStreaming } = app;
  const { columns, width, isLandscape } = useColumns(170, 4);

  const system = isSystemId(systemId) ? SYSTEM_BY_ID[systemId] : null;

  const pollIds = useMemo(
    () => (system ? pollCatalog.filter((info) => pollTargetServes(info, system.id)) : []),
    [pollCatalog, system],
  );
  const enabledCount = pollIds.filter((info) => !disabledPollIds.has(info.id)).length;

  if (!system) {
    return (
      <Screen title={t('tabSystems')} back>
        <EmptyState text={t('genericUnknown')} />
      </Screen>
    );
  }

  const kpis = readKpis(system, signalIndex);
  const kpiWidth = tileWidth(Math.min(columns, 4), width);
  const subsystemColumns = isLandscape && width > 700 ? 2 : 1;
  const subsystemWidth = tileWidth(subsystemColumns, width);
  const allEnabled = pollIds.length > 0 && enabledCount === pollIds.length;

  return (
    <Screen title={labelFor(system.title, locale)} subtitle={labelFor(system.description, locale)} back>
      <Grid>
        {kpis.map((kpi) => (
          <MetricTile
            key={kpi.spec.id}
            width={kpiWidth}
            label={labelFor(kpi.spec.label, locale)}
            value={kpi.text}
            unit={kpi.value !== null ? kpi.unit : undefined}
            accent={system.accent}
            warn={kpi.warn}
          />
        ))}
      </Grid>

      {/* Stream scope: everything needed to make this screen fill up. */}
      <Card
        title={canFilterEnabled ? t('systemPollStatus', { enabled: enabledCount, total: pollIds.length }) : t('settingsCanFilter')}
        icon="access-point-network"
        iconColor={enabledCount > 0 || !canFilterEnabled ? colors.live : colors.textDim}
      >
        {pollIds.length === 0 ? (
          <EmptyState text={t('systemNoPollIds')} />
        ) : canFilterEnabled ? (
          <>
            <Hint>{t('systemStreamOnlyHint')}</Hint>
            <ButtonRow>
              <Button
                icon="target"
                label={t('systemStreamOnly')}
                busy={actionBusy === `focus-${system.id}`}
                disabled={actionBusy !== null}
                onPress={() => runAction(`focus-${system.id}`, () => app.focusSystem(system.id))}
              />
              <Button
                variant="secondary"
                icon={allEnabled ? 'minus-circle-outline' : 'plus-circle-outline'}
                label={allEnabled ? t('systemRemoveFromStream') : t('systemAddToStream')}
                disabled={isStreaming}
                onPress={() => app.setSystemPollEnabled(system.id, !allEnabled)}
              />
            </ButtonRow>
          </>
        ) : (
          <Hint>{t('settingsCanFilterHint')}</Hint>
        )}
      </Card>

      <View style={styles.legend}>
        <AccessBadge access="read" />
        <Text style={styles.legendText}>{t('accessLegendRead')}</Text>
        <AccessBadge access="calc" />
        <Text style={styles.legendText}>{t('accessLegendCalc')}</Text>
      </View>

      <Grid>
        {system.subsystems.map((subsystem) => {
          const readings = subsystem.signals.map((spec) => readSignal(spec, signalIndex));
          const available = readings.filter((reading) => reading.value !== null).length;
          return (
            <Card
              key={subsystem.id}
              style={{ width: subsystemWidth }}
              title={labelFor(subsystem.title, locale)}
              subtitle={labelFor(subsystem.description, locale)}
              icon={subsystem.icon}
              iconColor={system.accent}
              right={
                <Text style={styles.count}>
                  {t('subsystemAvailable', { available, total: readings.length })}
                </Text>
              }
            >
              {readings.map((reading) => (
                <SignalRow key={reading.spec.id} reading={reading} />
              ))}
              {subsystem.detailRoute && subsystem.detailLabel ? (
                <Button
                  variant="secondary"
                  icon="arrow-right"
                  label={labelFor(subsystem.detailLabel, locale)}
                  onPress={() => router.navigate(subsystem.detailRoute as string)}
                />
              ) : null}
            </Card>
          );
        })}
      </Grid>

      <View style={styles.readOnly}>
        <MaterialCommunityIcons name="shield-lock-outline" size={16} color={colors.textDim} />
        <Text style={styles.readOnlyText}>{t('accessReadOnly')}</Text>
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  legendText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, marginRight: spacing.sm },
  count: { color: colors.textDim, fontFamily: fonts.heading, fontSize: 12 },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  readOnlyText: { color: colors.textDim, fontFamily: fonts.body, fontSize: 12, flex: 1 },
  }),
);
