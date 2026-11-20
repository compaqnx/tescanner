import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pollTargetServes } from '../../../lib/can/pollPlan';
import { labelFor } from '../../../lib/systems/readSignals';
import { SYSTEMS } from '../../../lib/systems/systemCatalog';
import { useApp } from '../../../state/AppContext';
import { Grid, Hint, Pill, Screen, tileWidth, useColumns } from '../../../ui/components';
import { colors, fonts, radius, spacing } from '../../../ui/theme';

export default function SystemsHub() {
  const { t, locale, systemSummaries, pollCatalog, disabledPollIds, canFilterEnabled } = useApp();
  const { columns, width } = useColumns(320, 3);
  const cardWidth = tileWidth(Math.min(columns, 3), width);

  return (
    <Screen title={t('systemsTitle')} subtitle={t('accessReadOnly')}>
      <Hint>{t('systemsHint')}</Hint>
      <Grid>
        {SYSTEMS.map((system) => {
          const { coverage, kpis } = systemSummaries[system.id];
          const systemIds = pollCatalog.filter((info) => pollTargetServes(info, system.id));
          const inStream = !canFilterEnabled || systemIds.some((info) => !disabledPollIds.has(info.id));

          return (
            <Pressable
              key={system.id}
              accessibilityRole="button"
              accessibilityLabel={labelFor(system.title, locale)}
              onPress={() => router.navigate(`/systems/${system.id}`)}
              style={({ pressed }) => [styles.card, { width: cardWidth, borderLeftColor: system.accent }, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.head}>
                <View style={[styles.iconWrap, { backgroundColor: `${system.accent}22` }]}>
                  <MaterialCommunityIcons name={system.icon} size={26} color={system.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.index}>{system.index}</Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {labelFor(system.title, locale)}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
              </View>

              <Text style={styles.description} numberOfLines={2}>
                {labelFor(system.description, locale)}
              </Text>

              <View style={styles.kpiGrid}>
                {kpis.map((kpi) => (
                  <View key={kpi.spec.id} style={styles.kpi}>
                    <Text style={styles.kpiLabel} numberOfLines={1}>
                      {labelFor(kpi.spec.label, locale)}
                    </Text>
                    <Text style={[styles.kpiValue, kpi.warn && { color: colors.danger }]} numberOfLines={1}>
                      {kpi.text}
                      {kpi.unit && kpi.value !== null ? <Text style={styles.kpiUnit}>{` ${kpi.unit}`}</Text> : null}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.footer}>
                <Pill
                  text={inStream ? t('systemsStreaming') : t('systemsNotStreaming')}
                  color={inStream ? colors.live : colors.textDim}
                />
                <Pill text={t('systemsCoverage', { available: coverage.available, total: coverage.total })} />
                {coverage.warnings > 0 ? (
                  <Pill text={t('systemsWarnings', { count: coverage.warnings })} color={colors.danger} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </Grid>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  index: { color: colors.textDim, fontFamily: fonts.heading, fontSize: 11, letterSpacing: 1 },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 17 },
  description: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  kpi: { width: '50%', paddingRight: spacing.sm },
  kpiLabel: { color: colors.textDim, fontFamily: fonts.body, fontSize: 11 },
  kpiValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 18 },
  kpiUnit: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
