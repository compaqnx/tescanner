import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { CAR_PHOTO, type CarPhotoConfig } from '../../../lib/vehicle/carPhoto';
import type { LocaleCode } from '../../../lib/i18n/localization';
import { buildHvOverview, type HvNode, type HvStatus } from '../../../lib/systems/hvOverview';
import { labelFor } from '../../../lib/systems/readSignals';
import type { Label } from '../../../lib/systems/systemCatalog';
import { useApp } from '../../../state/AppContext';
import { Button, Card, Grid, Hint, Screen, tileWidth, useColumns } from '../../../ui/components';
import type { IconName } from '../../../ui/icons';
import { colors, fonts, spacing, themed } from '../../../ui/theme';

/** Energised HV bus / pack colour (same in both themes, like a warning marking). */
const HV_ACTIVE = '#F2A900';
const HV_ACTIVE_SOFT = 'rgba(242, 169, 0, 0.28)';

const L = (en: string, ro: string): Label => ({ en, ro });

function statusColor(status: HvStatus): string {
  switch (status) {
    case 'ok':
      return colors.live;
    case 'idle':
      return colors.info;
    case 'warn':
      return colors.warn;
    case 'fault':
      return colors.danger;
    default:
      return colors.textDim;
  }
}

const STATUS_LABEL: Record<HvStatus, Label> = {
  ok: L('Active / OK', 'Activ / OK'),
  idle: L('Present, idle', 'Prezent, inactiv'),
  warn: L('Warning', 'Avertizare'),
  fault: L('Fault', 'Defect'),
  unknown: L('No data', 'Fara date'),
};

function Dot({ status, size = 10 }: { status: HvStatus; size?: number }) {
  const color = statusColor(status);
  const hollow = status === 'unknown';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hollow ? 'transparent' : color,
        borderWidth: hollow ? 1.5 : 0,
        borderColor: color,
      }}
    />
  );
}

function pct(value: number): DimensionValue {
  return `${value}%`;
}

interface PlacedComponent {
  id: HvNode['id'];
  short: Label;
  icon: IconName;
  left: number;
  top: number;
  width: number;
  height: number;
}

// Positions on the side-view schematic, in % of its box (front of the car on the left).
const PLACEMENT: PlacedComponent[] = [
  { id: 'compressor', short: L('Comp.', 'Comp.'), icon: 'snowflake', left: 5, top: 45, width: 8, height: 11 },
  { id: 'frontDu', short: L('Front DU', 'Motor fata'), icon: 'engine-outline', left: 13.5, top: 56, width: 11, height: 15 },
  { id: 'heater', short: L('PTC', 'PTC'), icon: 'radiator', left: 34, top: 46, width: 8, height: 11 },
  { id: 'pcs', short: L('PCS', 'PCS'), icon: 'flash-outline', left: 58, top: 46, width: 8, height: 11 },
  { id: 'rearDu', short: L('Rear DU', 'Motor spate'), icon: 'engine-outline', left: 75.5, top: 56, width: 11, height: 15 },
];

const BUS_TOP = 73;

function Schematic({
  width,
  energized,
  nodes,
  packText,
  locale,
}: {
  width: number;
  energized: boolean;
  nodes: HvNode[];
  packText: string;
  locale: LocaleCode;
}) {
  const height = Math.round(width * 0.44);
  const wheel = Math.round(height * 0.3);
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const busColor = energized ? HV_ACTIVE : colors.borderStrong;

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel="High-voltage system schematic">
      {/* Body: cabin, then the lower body over it. */}
      <View style={[styles.cabin, { left: pct(21), width: pct(50), top: pct(9), height: pct(36) }]}>
        <View style={[styles.window, { left: pct(8), width: pct(38) }]} />
        <View style={[styles.window, { left: pct(52), width: pct(36) }]} />
      </View>
      <View style={[styles.body, { left: pct(2.5), right: pct(2.5), top: pct(36), height: pct(42) }]} />

      {/* HV battery pack between the axles. */}
      <View
        style={[
          styles.pack,
          {
            left: pct(27),
            width: pct(46),
            top: pct(59),
            height: pct(13),
            backgroundColor: energized ? HV_ACTIVE_SOFT : colors.surface,
            borderColor: energized ? HV_ACTIVE : colors.borderStrong,
          },
        ]}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={[styles.packDivider, { borderColor: energized ? HV_ACTIVE : colors.border }]} />
        ))}
        <View style={styles.packLabelWrap} pointerEvents="none">
          <Text style={[styles.packLabel, { color: energized ? colors.text : colors.textMuted }]} numberOfLines={1}>
            {packText}
          </Text>
        </View>
      </View>

      {/* HV bus from the front drive unit to the rear one, plus stubs to the loads. */}
      <View style={[styles.bus, { left: pct(19), width: pct(62), top: pct(BUS_TOP), backgroundColor: busColor }]} />
      {PLACEMENT.filter((item) => item.id !== 'frontDu' && item.id !== 'rearDu').map((item) => (
        <View
          key={`stub-${item.id}`}
          style={[
            styles.stub,
            {
              left: pct(item.left + item.width / 2),
              top: pct(item.top + item.height),
              height: pct(BUS_TOP - item.top - item.height),
              backgroundColor: busColor,
            },
          ]}
        />
      ))}

      {/* Wheels. */}
      {[19, 81].map((x) => (
        <View
          key={`wheel-${x}`}
          style={[styles.wheel, { width: wheel, height: wheel, borderRadius: wheel / 2, left: (width * x) / 100 - wheel / 2, top: height * 0.79 - wheel / 2 }]}
        >
          <View style={[styles.hub, { width: wheel * 0.42, height: wheel * 0.42, borderRadius: wheel * 0.21 }]} />
        </View>
      ))}

      {/* Components on the DC link. */}
      {PLACEMENT.map((item) => {
        const node = byId.get(item.id);
        const status = node?.status ?? 'unknown';
        const color = statusColor(status);
        const active = status === 'ok';
        return (
          <View
            key={item.id}
            style={[
              styles.component,
              {
                left: pct(item.left),
                top: pct(item.top),
                width: pct(item.width),
                height: pct(item.height),
                borderColor: color,
                backgroundColor: active ? HV_ACTIVE_SOFT : colors.surface,
              },
            ]}
          >
            <MaterialCommunityIcons name={item.icon} size={Math.max(12, Math.round(height * 0.07))} color={color} />
            <View style={styles.componentLabelWrap} pointerEvents="none">
              <Text style={styles.componentLabel} numberOfLines={1}>
                {labelFor(item.short, locale)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The user's own car photo with the HV components drawn on top (see
 * lib/vehicle/carPhoto.ts). Same status colours and energised bus as the drawn
 * schematic; positions come from the photo's config.
 */
function PhotoSchematic({
  photo,
  width,
  energized,
  nodes,
  packText,
  locale,
}: {
  photo: CarPhotoConfig;
  width: number;
  energized: boolean;
  nodes: HvNode[];
  packText: string;
  locale: LocaleCode;
}) {
  const height = Math.round(width / photo.aspect);
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const busColor = energized ? HV_ACTIVE : colors.borderStrong;
  const block = Math.max(26, Math.round(Math.min(width, height) * 0.13));
  const duX = [photo.components.frontDu.x, photo.components.rearDu.x];
  const busLeft = Math.min(...duX);
  const busWidth = Math.abs(duX[0] - duX[1]);

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel="High-voltage system on the car photo">
      <Image source={photo.source} style={StyleSheet.absoluteFill} resizeMode="contain" />

      <View
        style={[
          styles.photoPack,
          {
            left: pct(photo.pack.left),
            top: pct(photo.pack.top),
            width: pct(photo.pack.width),
            height: pct(photo.pack.height),
            backgroundColor: energized ? HV_ACTIVE_SOFT : 'rgba(120, 130, 130, 0.18)',
            borderColor: energized ? HV_ACTIVE : colors.borderStrong,
          },
        ]}
      >
        <View style={styles.photoPackLabel}>
          <Text style={styles.photoPackText} numberOfLines={1}>
            {packText}
          </Text>
        </View>
      </View>

      <View style={[styles.bus, { left: pct(busLeft), width: pct(busWidth), top: pct(photo.busY), backgroundColor: busColor }]} />
      {PLACEMENT.filter((item) => item.id !== 'frontDu' && item.id !== 'rearDu').map((item) => {
        const point = photo.components[item.id];
        const top = Math.min(point.y, photo.busY);
        return (
          <View
            key={`stub-${item.id}`}
            style={[
              styles.stub,
              { left: pct(point.x), top: pct(top), height: pct(Math.abs(photo.busY - point.y)), backgroundColor: busColor },
            ]}
          />
        );
      })}

      {PLACEMENT.map((item) => {
        const point = photo.components[item.id];
        const status = byId.get(item.id)?.status ?? 'unknown';
        const color = statusColor(status);
        return (
          <View
            key={item.id}
            style={[
              styles.photoBlock,
              {
                width: block,
                height: block,
                left: (width * point.x) / 100 - block / 2,
                top: (height * point.y) / 100 - block / 2,
                borderColor: color,
                backgroundColor: status === 'ok' ? HV_ACTIVE : colors.surface,
              },
            ]}
          >
            <MaterialCommunityIcons name={item.icon} size={Math.round(block * 0.55)} color={status === 'ok' ? '#1A1300' : color} />
            <View style={styles.photoLabelWrap} pointerEvents="none">
              <Text style={styles.photoLabel} numberOfLines={1}>
                {labelFor(item.short, locale)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({ label, value, status }: { label: string; value: string | null; status?: HvStatus }) {
  return (
    <View style={styles.row}>
      {status ? <Dot status={status} /> : null}
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.rowValueMissing]} numberOfLines={1}>
        {value ?? '--'}
      </Text>
    </View>
  );
}

function ContactorGraphic({ closed }: { closed: boolean | null }) {
  const color = closed === true ? HV_ACTIVE : closed === false ? colors.textMuted : colors.textDim;
  return (
    <View style={styles.contactor}>
      <View style={[styles.terminal, { borderColor: color }]} />
      <View style={styles.contactorGap}>
        <View
          style={[
            styles.contactorBar,
            { backgroundColor: color },
            closed === true ? null : { transform: [{ translateY: -9 }, { rotate: '-24deg' }, { translateX: -4 }] },
          ]}
        />
      </View>
      <View style={[styles.terminal, { borderColor: color }]} />
    </View>
  );
}

export default function HvOverviewScreen() {
  const { t, locale, signalIndex, isStreaming, actionBusy, runAction, focusSystem } = useApp();
  const { columns, width } = useColumns(260, 3);
  const cardWidth = tileWidth(Math.min(columns, 3), width);

  // Re-evaluate staleness once a second even when no new frames arrive.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hv = useMemo(() => buildHvOverview(signalIndex, now), [signalIndex, now]);
  const schematicWidth = width - spacing.md * 2 - 2;
  const lbl = (label: Label) => labelFor(label, locale);

  const packText = [hv.battery.soc, hv.battery.voltage].filter(Boolean).join(' · ') || lbl(L('HV battery', 'Baterie HV'));
  const anyData =
    hv.battery.voltage !== null || hv.battery.soc !== null || hv.nodes.some((node) => node.status !== 'unknown');

  return (
    <Screen title={lbl(L('HV system', 'Sistem HV'))} subtitle={t('accessReadOnly')} back>
      <Card>
        {CAR_PHOTO ? (
          <PhotoSchematic
            photo={CAR_PHOTO}
            width={schematicWidth}
            energized={hv.energized}
            nodes={hv.nodes}
            packText={packText}
            locale={locale}
          />
        ) : (
          <Schematic width={schematicWidth} energized={hv.energized} nodes={hv.nodes} packText={packText} locale={locale} />
        )}
        <View style={styles.busState}>
          <View style={[styles.busSwatch, { backgroundColor: hv.energized ? HV_ACTIVE : colors.borderStrong }]} />
          <Text style={styles.busStateText}>
            {hv.energized
              ? lbl(L('HV bus energised', 'Magistrala HV sub tensiune'))
              : lbl(L('HV bus not energised / unknown', 'Magistrala HV fara tensiune / necunoscut'))}
          </Text>
        </View>
      </Card>

      {!anyData ? (
        <Card>
          <Hint>
            {lbl(
              L(
                'No high-voltage data yet. Stream the energy-storage messages to fill this view.',
                'Inca nu exista date de inalta tensiune. Porneste fluxul pentru stocarea energiei pentru a completa aceasta vedere.',
              ),
            )}
          </Hint>
          <Button
            icon="target"
            label={t('systemStreamOnly')}
            busy={actionBusy === 'focus-ess'}
            disabled={actionBusy !== null}
            onPress={() => runAction('focus-ess', () => focusSystem('ess'))}
          />
        </Card>
      ) : null}

      <Grid>
        <Card style={{ width: cardWidth }} title={lbl(L('HV battery', 'Baterie HV'))} icon="car-battery">
          <Row label={lbl(L('State', 'Stare'))} value={hv.battery.state} status={hv.battery.stateStatus} />
          <Row label={lbl(L('Charge', 'Incarcare'))} value={hv.battery.soc} status={hv.battery.soc ? 'ok' : 'unknown'} />
          <Row label="HVIL" value={hv.battery.hvil} status={hv.battery.hvilStatus} />
          <View style={styles.divider} />
          <Row label={lbl(L('Voltage', 'Tensiune'))} value={hv.battery.voltage} />
          <Row label={lbl(L('Current', 'Curent'))} value={hv.battery.current} />
          <Row label={lbl(L('Power', 'Putere'))} value={hv.battery.power} />
          <Row label={lbl(hv.battery.healthLabel)} value={hv.battery.health} />
        </Card>

        <Card style={{ width: cardWidth }} title={lbl(L('Contactors & isolation', 'Contactori si izolatie'))} icon="electric-switch">
          <View style={styles.contactorHead}>
            <Dot status={hv.contactors.status} size={12} />
            <Text style={styles.contactorText}>
              {hv.contactors.closed === true
                ? lbl(L('Closed', 'Inchisi'))
                : hv.contactors.closed === false
                  ? lbl(L('Open', 'Deschisi'))
                  : lbl(L('Unknown', 'Necunoscut'))}
            </Text>
          </View>
          <ContactorGraphic closed={hv.contactors.closed} />
          {hv.contactors.text ? <Row label={lbl(L('Reported state', 'Stare raportata'))} value={hv.contactors.text} /> : null}
          {hv.contactors.inferred ? (
            <Text style={styles.note}>
              {lbl(L('Inferred from current flowing through the pack.', 'Dedus din curentul care trece prin pachet.'))}
            </Text>
          ) : null}
          <View style={styles.divider} />
          <Row label={lbl(L('Isolation resistance', 'Rezistenta izolatie'))} value={hv.isolation.text} status={hv.isolation.status} />
        </Card>

        <Card style={{ width: cardWidth }} title={lbl(L('DC link', 'Legatura DC'))} icon="transit-connection-variant">
          {hv.nodes.map((node) => (
            <View key={node.id} style={styles.nodeRow}>
              <Dot status={node.status} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{lbl(node.label)}</Text>
                {node.secondary ? <Text style={styles.nodeSecondary}>{node.secondary}</Text> : null}
              </View>
              <Text style={[styles.rowValue, !node.primary && styles.rowValueMissing]} numberOfLines={1}>
                {node.primary ?? '--'}
              </Text>
            </View>
          ))}
        </Card>
      </Grid>

      <View style={styles.legend}>
        {(Object.keys(STATUS_LABEL) as HvStatus[]).map((status) => (
          <View key={status} style={styles.legendItem}>
            <Dot status={status} />
            <Text style={styles.legendText}>{lbl(STATUS_LABEL[status])}</Text>
          </View>
        ))}
      </View>
      {!isStreaming ? (
        <Text style={styles.note}>{lbl(L('Values freeze when the stream is stopped, turn grey after 30 s and clear on disconnect.', 'Valorile se opresc cand fluxul este oprit, devin gri dupa 30 s si se sterg la deconectare.'))}</Text>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    cabin: {
      position: 'absolute',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderTopLeftRadius: 80,
      borderTopRightRadius: 46,
    },
    window: {
      position: 'absolute',
      top: '22%',
      bottom: '8%',
      backgroundColor: colors.border,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 14,
      opacity: 0.7,
    },
    body: {
      position: 'absolute',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderTopLeftRadius: 40,
      borderTopRightRadius: 26,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
    },
    pack: {
      position: 'absolute',
      borderWidth: 1.5,
      borderRadius: 4,
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      overflow: 'hidden',
    },
    packDivider: { width: 0, borderLeftWidth: 1, height: '100%', opacity: 0.6 },
    packLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    packLabel: { fontFamily: fonts.heading, fontSize: 11 },
    bus: { position: 'absolute', height: 3, borderRadius: 2 },
    stub: { position: 'absolute', width: 2, marginLeft: -1 },
    wheel: {
      position: 'absolute',
      backgroundColor: '#2B2F31',
      borderWidth: 3,
      borderColor: '#4A5154',
      alignItems: 'center',
      justifyContent: 'center',
    },
    hub: { backgroundColor: '#9AA3A6', borderWidth: 2, borderColor: '#5E6669' },
    component: {
      position: 'absolute',
      borderWidth: 1.5,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    componentLabelWrap: { position: 'absolute', bottom: '100%', left: -30, right: -30, alignItems: 'center', marginBottom: 2 },
    componentLabel: { color: colors.text, fontFamily: fonts.heading, fontSize: 9 },
    photoPack: { position: 'absolute', borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    photoPackLabel: { backgroundColor: 'rgba(0, 0, 0, 0.55)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
    photoPackText: { color: '#FFFFFF', fontFamily: fonts.heading, fontSize: 11 },
    photoBlock: {
      position: 'absolute',
      borderWidth: 2,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoLabelWrap: { position: 'absolute', top: '100%', left: -40, right: -40, alignItems: 'center', marginTop: 2 },
    photoLabel: {
      color: '#FFFFFF',
      fontFamily: fonts.heading,
      fontSize: 9,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      borderRadius: 3,
      paddingHorizontal: 4,
      overflow: 'hidden',
    },
    busState: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    busSwatch: { width: 18, height: 4, borderRadius: 2 },
    busStateText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
    rowLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 14, flex: 1 },
    rowValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 14, maxWidth: '55%', textAlign: 'right' },
    rowValueMissing: { color: colors.textDim },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
    contactorHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    contactorText: { color: colors.text, fontFamily: fonts.heading, fontSize: 18 },
    contactor: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingVertical: spacing.md },
    terminal: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
    contactorGap: { width: 64, height: 24, justifyContent: 'center' },
    contactorBar: { height: 3, borderRadius: 2, width: '100%' },
    note: { color: colors.textDim, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
    nodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      minHeight: 40,
    },
    nodeSecondary: { color: colors.textDim, fontFamily: fonts.body, fontSize: 11 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  }),
);
