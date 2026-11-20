import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TranslationKey } from '../lib/i18n/localization';
import { SignalReading, STALE_AFTER_MS, labelFor } from '../lib/systems/readSignals';
import type { TelemetryStatus } from '../state/useTelemetryController';
import { useApp } from '../state/AppContext';
import type { IconName } from './icons';
import { colors, fonts, radius, spacing, TOUCH_TARGET } from './theme';

/* ------------------------------------------------------------------ layout */

/** Column count that keeps tiles readable on phones, landscape and tablets. */
export function useColumns(minTileWidth = 150, maxColumns = 6): { columns: number; width: number; isLandscape: boolean } {
  const { width, height } = useWindowDimensions();
  const usable = width - spacing.md * 2;
  const columns = Math.max(2, Math.min(maxColumns, Math.floor(usable / minTileWidth)));
  return { columns, width: usable, isLandscape: width > height };
}

export function tileWidth(columns: number, usable: number, gap = spacing.sm): number {
  return Math.floor((usable - gap * (columns - 1)) / columns);
}

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Show a back chevron (stack screens). */
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}

export function Screen({ title, subtitle, back, right, children, scroll = true }: ScreenProps) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.screenBody} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenBody, { flex: 1 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.navigate('/systems'))}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      <ConnectionBar />
      {body}
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------- connection bar */

const STATUS_COLOR: Record<TelemetryStatus, string> = {
  booting: colors.warn,
  idle: colors.textDim,
  scanning: colors.info,
  connecting: colors.info,
  connected: colors.info,
  streaming: colors.live,
  error: colors.danger,
};

const STATUS_KEY: Record<TelemetryStatus, TranslationKey> = {
  booting: 'statusBooting',
  idle: 'statusIdle',
  scanning: 'statusScanning',
  connecting: 'statusConnecting',
  connected: 'statusConnected',
  streaming: 'statusStreaming',
  error: 'statusError',
};

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? '00:00' : formatElapsed(now - since);
}

/**
 * Always-visible status strip with the one action that matters right now:
 * find adapter → start stream → stop stream. Keeps the main flow one tap away
 * from every screen.
 */
export function ConnectionBar() {
  const {
    status,
    t,
    selectedDevice,
    isConnected,
    isStreaming,
    isBusy,
    actionBusy,
    runAction,
    startStreaming,
    stopStreaming,
    scanForAdapters,
    framesPerSecond,
    streamStartedAt,
    localizedError,
  } = useApp();
  const elapsed = useElapsed(isStreaming ? streamStartedAt : null);
  const color = STATUS_COLOR[status];

  let action: ReactNode = null;
  if (isStreaming) {
    action = (
      <Button
        compact
        variant="danger"
        icon="stop"
        label={t('connStop')}
        busy={actionBusy === 'stream-stop'}
        disabled={actionBusy !== null}
        onPress={() => runAction('stream-stop', stopStreaming)}
      />
    );
  } else if (status === 'connected') {
    action = (
      <Button
        compact
        icon="play"
        label={t('connStart')}
        busy={actionBusy === 'stream-start'}
        disabled={actionBusy !== null}
        onPress={() => runAction('stream-start', startStreaming)}
      />
    );
  } else if (!isConnected) {
    action = (
      <Button
        compact
        variant="secondary"
        icon="bluetooth-connect"
        label={t('connFindAdapter')}
        busy={status === 'scanning' || isBusy}
        disabled={isBusy || actionBusy !== null}
        onPress={() => {
          router.navigate('/setup');
          void runAction('scan', scanForAdapters);
        }}
      />
    );
  }

  return (
    <View style={styles.connWrap}>
      <View style={styles.connBar}>
        <View style={[styles.connDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.connStatus, { color }]} numberOfLines={1}>
            {t(STATUS_KEY[status])}
            {isStreaming ? `  ·  ${t('connRecording', { time: elapsed })}` : ''}
          </Text>
          <Text style={styles.connMeta} numberOfLines={1}>
            {selectedDevice ? selectedDevice.name : t('connNoAdapter')}
            {isStreaming ? `  ·  ${t('connRate', { value: framesPerSecond.toFixed(0) })}` : ''}
          </Text>
        </View>
        {action}
      </View>
      {localizedError ? (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText} numberOfLines={2}>
            {localizedError}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- buttons */

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, icon, variant = 'primary', busy, disabled, compact, style }: ButtonProps) {
  const palette = {
    primary: { bg: colors.neon, fg: colors.onNeon, border: colors.neon },
    secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.borderStrong },
    danger: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: colors.border },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={compact ? 18 : 20} color={palette.fg} />
      ) : null}
      <Text style={[styles.buttonText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.buttonRow}>{children}</View>;
}

interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: string; icon?: IconName; badge?: number }>;
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}
          >
            {option.icon ? (
              <MaterialCommunityIcons name={option.icon} size={16} color={active ? colors.onNeon : colors.textMuted} />
            ) : null}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            {option.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{option.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------- cards */

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export function Card({ title, subtitle, icon, iconColor, right, children, style, onPress }: CardProps) {
  const content = (
    <>
      {title ? (
        <View style={styles.cardHeader}>
          {icon ? <MaterialCommunityIcons name={icon} size={20} color={iconColor ?? colors.textMuted} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{content}</View>;
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function EmptyState({ icon = 'information-outline', text }: { icon?: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textDim} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

/* ----------------------------------------------------------------- metrics */

interface MetricTileProps {
  label: string;
  value: string;
  unit?: string;
  width?: number;
  accent?: string;
  warn?: boolean;
  large?: boolean;
  onPress?: () => void;
}

export function MetricTile({ label, value, unit, width, accent, warn, large, onPress }: MetricTileProps) {
  const valueColor = warn ? colors.danger : accent ?? colors.text;
  const body = (
    <>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.metricValueRow}>
        <Text
          style={[styles.metricValue, large && styles.metricValueLarge, { color: valueColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
    </>
  );
  const tileStyle = [styles.metricTile, width ? { width } : null, warn && styles.metricTileWarn];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...tileStyle, pressed && styles.pressed]}>
        {body}
      </Pressable>
    );
  }
  return <View style={tileStyle}>{body}</View>;
}

export function Grid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** Centre-zero bar: regen grows left in green, drive grows right in neon. */
export function PowerBar({ kw, maxDrive = 300, maxRegen = 100 }: { kw: number | null; maxDrive?: number; maxRegen?: number }) {
  const value = kw ?? 0;
  const driveFraction = value > 0 ? Math.min(1, value / maxDrive) : 0;
  const regenFraction = value < 0 ? Math.min(1, -value / maxRegen) : 0;
  return (
    <View style={styles.powerBar}>
      <View style={styles.powerHalf}>
        <View style={[styles.powerFill, { width: `${regenFraction * 100}%`, backgroundColor: colors.regen, alignSelf: 'flex-end' }]} />
      </View>
      <View style={styles.powerZero} />
      <View style={styles.powerHalf}>
        <View style={[styles.powerFill, { width: `${driveFraction * 100}%`, backgroundColor: colors.drive }]} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- signal rows */

export function AccessBadge({ access }: { access: 'read' | 'calc' }) {
  const { t } = useApp();
  const isCalc = access === 'calc';
  return (
    <View style={[styles.accessBadge, isCalc && styles.accessBadgeCalc]}>
      <Text style={[styles.accessText, isCalc && styles.accessTextCalc]}>{isCalc ? t('accessCalc') : t('accessRead')}</Text>
    </View>
  );
}

export function SignalRow({ reading }: { reading: SignalReading }) {
  const { locale, t } = useApp();
  const missing = reading.value === null;
  const stale = !missing && reading.updatedAt !== null && Date.now() - reading.updatedAt > STALE_AFTER_MS;
  return (
    <View style={styles.signalRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.signalLabel} numberOfLines={2}>
          {labelFor(reading.spec.label, locale)}
        </Text>
        <View style={styles.signalMetaRow}>
          <AccessBadge access={reading.spec.access ?? 'read'} />
          {reading.source ? (
            <Text style={styles.signalSource} numberOfLines={1}>
              {reading.source}
            </Text>
          ) : null}
          {stale ? <Text style={styles.signalStale}>{t('signalStale')}</Text> : null}
        </View>
      </View>
      <Text
        style={[
          styles.signalValue,
          missing && styles.signalValueMissing,
          reading.warn && { color: colors.danger },
          reading.spec.kind === 'state' && styles.signalValueState,
        ]}
        numberOfLines={2}
      >
        {reading.text}
        {reading.unit && !missing ? <Text style={styles.signalUnit}>{` ${reading.unit}`}</Text> : null}
      </Text>
    </View>
  );
}

export function Pill({ text, color = colors.textMuted }: { text: string; color?: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  screenBody: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    minHeight: TOUCH_TARGET,
  },
  headerTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 22, letterSpacing: 0.3 },
  headerSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },

  connWrap: { paddingHorizontal: spacing.md, gap: spacing.xs },
  connBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: TOUCH_TARGET + spacing.sm,
  },
  connDot: { width: 10, height: 10, borderRadius: 5 },
  connStatus: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 0.6 },
  connMeta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: { color: '#FFD6D6', fontFamily: fonts.body, fontSize: 12, flex: 1 },

  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: spacing.md },
  buttonText: { fontFamily: fonts.heading, fontSize: 15 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },

  segmented: { gap: spacing.sm, paddingVertical: 2 },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentActive: { backgroundColor: colors.neon, borderColor: colors.neon },
  segmentText: { color: colors.textMuted, fontFamily: fonts.heading, fontSize: 14 },
  segmentTextActive: { color: colors.onNeon },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#1A0A0A', fontFamily: fonts.heading, fontSize: 11 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 16 },
  cardSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: fonts.heading,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  emptyText: { color: colors.textDim, fontFamily: fonts.body, fontSize: 13, flex: 1 },
  hint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricTile: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
    minHeight: 72,
    justifyContent: 'center',
  },
  metricTileWarn: { borderColor: colors.danger },
  metricLabel: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metricValue: { fontFamily: fonts.heading, fontSize: 26 },
  metricValueLarge: { fontSize: 44 },
  metricUnit: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },

  powerBar: { flexDirection: 'row', alignItems: 'center', height: 14, gap: 2 },
  powerHalf: { flex: 1, height: 10, backgroundColor: colors.surfaceRaised, borderRadius: 5, overflow: 'hidden' },
  powerFill: { height: '100%', borderRadius: 5 },
  powerZero: { width: 2, height: 14, backgroundColor: colors.textMuted },

  accessBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#1E2A22',
  },
  accessBadgeCalc: { backgroundColor: '#2A2440' },
  accessText: { color: colors.live, fontFamily: fonts.heading, fontSize: 9, letterSpacing: 0.6 },
  accessTextCalc: { color: '#B39DFF' },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    minHeight: TOUCH_TARGET,
  },
  signalLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 14 },
  signalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signalSource: { color: colors.textDim, fontFamily: fonts.mono, fontSize: 10, flexShrink: 1 },
  signalStale: { color: colors.warn, fontFamily: fonts.body, fontSize: 10 },
  signalValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 18, textAlign: 'right', maxWidth: '50%' },
  signalValueState: { fontSize: 14 },
  signalValueMissing: { color: colors.textDim },
  signalUnit: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },

  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontFamily: fonts.heading, fontSize: 11, letterSpacing: 0.4 },
});
