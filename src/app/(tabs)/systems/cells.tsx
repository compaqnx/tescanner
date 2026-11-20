import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { pickHvAccessorySignals, pickHvCellSignals } from '../../../lib/hv/hvSignalCatalog';
import { formatNumber } from '../../../lib/systems/readSignals';
import { useApp } from '../../../state/AppContext';
import {
  Button,
  Card,
  EmptyState,
  Grid,
  MetricTile,
  Screen,
  Segmented,
  tileWidth,
  useColumns,
} from '../../../ui/components';
import { colors, fonts, radius, spacing } from '../../../ui/theme';

type ViewMode = 'map' | 'bars' | 'internals';

/** Colour a cell by where it sits between pack min and max. */
function cellColor(value: number, min: number, max: number): string {
  if (max - min < 0.002) {
    return '#1F5F3A';
  }
  const ratio = (value - min) / (max - min);
  if (ratio < 0.15) {
    return '#7A2626';
  }
  if (ratio < 0.4) {
    return '#6B5420';
  }
  return '#1F5F3A';
}

export default function CellsScreen() {
  const app = useApp();
  const { t, signals, actionBusy, runAction } = app;
  const [mode, setMode] = useState<ViewMode>('map');
  const { columns, width } = useColumns(120, 4);

  const cells = useMemo(() => pickHvCellSignals(signals), [signals]);
  const internals = useMemo(() => pickHvAccessorySignals(signals, 24), [signals]);

  const stats = useMemo(() => {
    if (cells.length === 0) {
      return null;
    }
    let min = cells[0];
    let max = cells[0];
    let total = 0;
    for (const cell of cells) {
      if (cell.value < min.value) min = cell;
      if (cell.value > max.value) max = cell;
      total += cell.value;
    }
    return { min, max, avg: total / cells.length, delta: max.value - min.value };
  }, [cells]);

  const statWidth = tileWidth(Math.min(4, columns), width);
  // Dense map: as many columns as fit at ~56dp per cell.
  const mapColumns = Math.max(6, Math.floor(width / 58));
  const mapCellWidth = tileWidth(mapColumns, width - spacing.md * 2, 4);

  return (
    <Screen title={t('cellsTitle')} subtitle={stats ? t('cellsCount', { count: cells.length }) : undefined} back>
      <Grid>
        <MetricTile width={statWidth} label={t('cellsLowest')} value={formatNumber(stats?.min.value ?? null, 3)} unit="V" accent={colors.danger} />
        <MetricTile width={statWidth} label={t('cellsHighest')} value={formatNumber(stats?.max.value ?? null, 3)} unit="V" accent={colors.live} />
        <MetricTile
          width={statWidth}
          label={t('liveCellDelta')}
          value={stats ? (stats.delta * 1000).toFixed(0) : '--'}
          unit="mV"
          warn={stats !== null && stats.delta > 0.03}
        />
        <MetricTile width={statWidth} label={t('cellsAvg', { value: '' }).trim()} value={formatNumber(stats?.avg ?? null, 3)} unit="V" />
      </Grid>

      <Segmented<ViewMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'map', label: t('hvViewGrid'), icon: 'view-grid' },
          { value: 'bars', label: t('hvViewBars'), icon: 'chart-bar' },
          { value: 'internals', label: t('sectionHvInternals'), icon: 'engine-outline' },
        ]}
      />

      {mode !== 'internals' && cells.length === 0 ? (
        <Card>
          <EmptyState icon="battery-unknown" text={t('hvNoCellData')} />
          <Button
            icon="target"
            label={t('systemStreamOnly')}
            busy={actionBusy === 'focus-ess'}
            disabled={actionBusy !== null}
            onPress={() => runAction('focus-ess', () => app.focusSystem('ess'))}
          />
        </Card>
      ) : null}

      {mode === 'map' && stats ? (
        <Card>
          <View style={styles.map}>
            {cells.map((cell) => {
              const isMin = cell.index === stats.min.index;
              const isMax = cell.index === stats.max.index;
              return (
                <View
                  key={cell.key}
                  style={[
                    styles.mapCell,
                    { width: mapCellWidth, backgroundColor: cellColor(cell.value, stats.min.value, stats.max.value) },
                    isMin && styles.mapCellMin,
                    isMax && styles.mapCellMax,
                  ]}
                >
                  <Text style={styles.mapIndex}>{cell.index + 1}</Text>
                  <Text style={styles.mapValue}>{cell.value.toFixed(3)}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {mode === 'bars' && stats ? (
        <Card subtitle={`${t('hvBarsYAxis')} · ${t('hvBarsXAxis')}`}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.bars}>
              {cells.map((cell) => {
                const span = stats.max.value - stats.min.value;
                const normalized = span > 0 ? (cell.value - stats.min.value) / span : 0.6;
                const low = cell.index === stats.min.index;
                return (
                  <View key={cell.key} style={styles.barItem}>
                    <View
                      style={[
                        styles.bar,
                        { height: 30 + normalized * 130, backgroundColor: low ? colors.danger : '#0D9B1B' },
                      ]}
                    />
                    <Text style={styles.barIndex}>{cell.index + 1}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>
      ) : null}

      {mode === 'internals' ? (
        <Card title={t('sectionHvInternals')} icon="engine-outline">
          {internals.length === 0 ? (
            <EmptyState text={t('hvInternalsEmpty')} />
          ) : (
            internals.map((signal) => (
              <View key={signal.key} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{signal.signalName}</Text>
                  <Text style={styles.rowMeta}>{signal.messageName}</Text>
                </View>
                <Text style={styles.rowValue}>{signal.displayValue}</Text>
              </View>
            ))
          )}
        </Card>
      ) : null}

      {mode === 'map' && stats ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#7A2626' }]} />
            <Text style={styles.legendText}>{t('cellsLowest')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#1F5F3A' }]} />
            <Text style={styles.legendText}>{t('statusOk')}</Text>
          </View>
          <View style={styles.legendItem}>
            <MaterialCommunityIcons name="square-outline" size={14} color={colors.neon} />
            <Text style={styles.legendText}>{t('cellsHighest')}</Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  mapCell: { borderRadius: radius.sm, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  mapCellMin: { borderColor: colors.danger },
  mapCellMax: { borderColor: colors.neon },
  mapIndex: { color: '#CFE7DE', fontFamily: fonts.body, fontSize: 9 },
  mapValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 11 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 190, paddingTop: spacing.sm },
  barItem: { alignItems: 'center', gap: 2 },
  bar: { width: 10, borderRadius: 3 },
  barIndex: { color: colors.textDim, fontFamily: fonts.body, fontSize: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 13 },
  rowMeta: { color: colors.textDim, fontFamily: fonts.mono, fontSize: 10 },
  rowValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 14 },
  legend: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
});
