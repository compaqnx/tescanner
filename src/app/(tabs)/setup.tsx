import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { estimateCycleMs, pollTargetServes } from '../../lib/can/pollPlan';
import type { TranslationKey } from '../../lib/i18n/localization';
import { labelFor } from '../../lib/systems/readSignals';
import { SYSTEM_BY_ID, SYSTEMS } from '../../lib/systems/systemCatalog';
import { useApp } from '../../state/AppContext';
import { Button, ButtonRow, Card, EmptyState, Hint, Pill, Screen, Segmented, tileWidth, useColumns } from '../../ui/components';
import type { IconName } from '../../ui/icons';
import { accentColor, colors, fonts, radius, spacing, TOUCH_TARGET, themed } from '../../ui/theme';

const PROFILE_KEYS: Record<string, { name: TranslationKey; desc: TranslationKey }> = {
  model3y: { name: 'profileModel3yName', desc: 'profileModel3yDesc' },
  modelsx: { name: 'profileModelsxName', desc: 'profileModelsxDesc' },
};

export default function SetupScreen() {
  const app = useApp();
  const {
    t,
    locale,
    status,
    devices,
    selectedDevice,
    isConnected,
    isStreaming,
    isBusy,
    actionBusy,
    runAction,
    pollCatalog,
    disabledPollIds,
    canFilterEnabled,
  } = app;
  const { columns, width } = useColumns(220, 3);
  const profileWidth = tileWidth(Math.min(columns, 2), width - spacing.md * 2);
  const [showAllIds, setShowAllIds] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const connectBusy = status === 'connecting' || actionBusy !== null || isStreaming;

  const enabledInfos = useMemo(
    () => pollCatalog.filter((info) => !disabledPollIds.has(info.id)),
    [disabledPollIds, pollCatalog],
  );
  const cycleSeconds = (estimateCycleMs(enabledInfos) / 1000).toFixed(1);
  const selectionLocked = isStreaming;

  return (
    <Screen title={t('tabSetup')}>
      {/* 1. Adapter: the first thing a new user needs. */}
      <Card
        title={t('setupAdapter')}
        subtitle={selectedDevice ? `${t('settingsCurrentAdapter')}: ${selectedDevice.name}` : t('settingsNoAdapter')}
        icon="bluetooth-connect"
        iconColor={isConnected ? colors.live : colors.textMuted}
      >
        <ButtonRow>
          <Button
            icon="magnify"
            label={status === 'scanning' ? t('setupSearching') : t('actionScanAdapters')}
            busy={status === 'scanning'}
            disabled={isBusy || actionBusy !== null || isStreaming}
            onPress={() => runAction('scan', app.scanForAdapters)}
          />
          {status === 'scanning' ? (
            <Button variant="secondary" icon="stop" label={t('actionStopScan')} onPress={app.stopScan} />
          ) : null}
          {isConnected ? (
            <Button
              variant="secondary"
              icon="link-variant-off"
              label={t('actionDisconnect')}
              disabled={actionBusy !== null}
              onPress={() => runAction('disconnect', app.disconnect)}
            />
          ) : null}
        </ButtonRow>
        {devices.length === 0 ? (
          <EmptyState icon="bluetooth-off" text={t('noAdapters')} />
        ) : (
          devices.map((device) => {
            const isSelected = selectedDevice?.id === device.id;
            const busy = actionBusy === `connect-${device.id}`;
            return (
              <View key={device.id} style={[styles.deviceRow, isSelected && styles.deviceRowActive]}>
                <MaterialCommunityIcons
                  name={isSelected ? 'bluetooth-connect' : 'bluetooth'}
                  size={22}
                  color={isSelected ? colors.live : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.meta}>{t('rssiLabel', { value: device.rssi ?? t('genericNotAvailable') })}</Text>
                </View>
                <Button
                  compact
                  variant={isSelected ? 'secondary' : 'primary'}
                  label={isSelected ? t('connectedState') : t('actionConnect')}
                  busy={busy}
                  disabled={isSelected || (actionBusy !== null && !busy) || isStreaming}
                  onPress={() => runAction(`connect-${device.id}`, () => app.connectToAdapter(device.id))}
                />
              </View>
            );
          })
        )}

        {/* Fallback: connect straight to the address Android shows for the paired
            dongle, for when a Classic-bonded vLinker never advertises in the scan. */}
        <Text style={styles.subLabel}>{t('manualAddressTitle')}</Text>
        <View style={styles.manualRow}>
          <TextInput
            value={manualAddress}
            onChangeText={setManualAddress}
            placeholder={t('manualAddressPlaceholder')}
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            style={styles.addrInput}
          />
          <Button
            compact
            variant="secondary"
            icon="bluetooth-settings"
            label={t('actionConnectManual')}
            disabled={manualAddress.trim().length === 0 || connectBusy}
            onPress={() => runAction('connect-manual', () => app.connectToAddress(manualAddress))}
          />
        </View>
        <Hint>{t('manualAddressHint')}</Hint>
      </Card>

      {/* Connection log: live scan & connect events, to debug adapter discovery. */}
      <Card title={t('connectionLog')} icon="console-line" subtitle={t('connectionLogHint')}>
        {app.connectionLog.length > 0 ? (
          <ButtonRow>
            <Button
              compact
              variant="ghost"
              icon="trash-can-outline"
              label={t('actionClearLog')}
              onPress={app.clearConnectionLog}
            />
          </ButtonRow>
        ) : null}
        {app.connectionLog.length === 0 ? (
          <EmptyState icon="console" text={t('connectionLogEmpty')} />
        ) : (
          <View style={styles.logBox}>
            {app.connectionLog.slice(0, 60).map((line, index) => (
              <Text key={`${index}-${line}`} style={styles.logLine} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </View>
        )}
      </Card>

      {/* 2. Vehicle profile decides which DBC is used. */}
      <Card title={t('setupVehicle')} icon="car-info" subtitle={isConnected ? t('errSwitchProfileIdle') : undefined}>
        {app.detectedVehicle ? (
          <Hint>
            {app.detectedVehicle.vin
              ? t('vehicleDetectedVin', { vin: app.detectedVehicle.vin })
              : app.detectedVehicle.profileId
                ? t('vehicleDetectedTraffic', { count: app.detectedVehicle.idCount })
                : t('vehicleNotDetected')}
          </Hint>
        ) : (
          <Hint>{t('vehicleAutoDetectHint')}</Hint>
        )}
        <View style={styles.profileGrid}>
          {app.vehicleProfiles.map((profile) => {
            const selected = profile.id === app.selectedVehicleProfileId;
            const keys = PROFILE_KEYS[profile.id];
            return (
              <Pressable
                key={profile.id}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: isConnected }}
                disabled={actionBusy !== null || isConnected}
                onPress={() => runAction(`profile-${profile.id}`, () => app.setVehicleProfile(profile.id))}
                style={({ pressed }) => [
                  styles.profileCard,
                  { width: profileWidth },
                  selected && styles.profileCardActive,
                  isConnected && !selected && { opacity: 0.5 },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <MaterialCommunityIcons
                  name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={selected ? colors.neon : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileTitle}>{keys ? t(keys.name) : profile.name}</Text>
                  <Text style={styles.meta}>{keys ? t(keys.desc) : profile.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* 2b. Reference for the battery-health (SOH) estimate. */}
      <Card title={t('packReferenceLabel')} icon="battery-heart-variant" subtitle={t('packReferenceHint')}>
        <Segmented<string>
          value={app.packReferenceKwh === null ? 'auto' : String(app.packReferenceKwh)}
          onChange={(value) => app.setPackReferenceKwh(value === 'auto' ? null : Number(value))}
          options={[
            { value: 'auto', label: t('packReferenceAuto') },
            ...['60', '70', '75', '85', '90', '100'].map((kwh) => ({ value: kwh, label: `${kwh} kWh` })),
          ]}
        />
      </Card>

      {/* 3. Data stream: what the adapter is asked to listen for. */}
      <Card title={t('setupStream')} icon="access-point-network" subtitle={t('settingsCanFilterHint')}>
        <Segmented<'on' | 'off'>
          value={canFilterEnabled ? 'on' : 'off'}
          onChange={(value) => {
            if (!selectionLocked) {
              app.setCanFilterEnabled(value === 'on');
            }
          }}
          options={[
            { value: 'on', label: `${t('settingsCanFilter')}: ${t('settingsCanFilterOn')}`, icon: 'filter-outline' },
            { value: 'off', label: t('settingsCanFilterOff'), icon: 'filter-off-outline' },
          ]}
        />

        {canFilterEnabled ? (
          <>
            <View style={styles.refreshRow}>
              <MaterialCommunityIcons name="timer-sand" size={16} color={colors.textMuted} />
              <Text style={styles.meta}>
                {t('signalSelectionRefresh', { value: `${cycleSeconds}s`, count: enabledInfos.length })}
              </Text>
            </View>
            {selectionLocked ? <Hint>{t('commandBlockedWhileStreaming')}</Hint> : null}

            {SYSTEMS.map((system) => {
              const ids = pollCatalog.filter((info) => pollTargetServes(info, system.id));
              const enabled = ids.filter((info) => !disabledPollIds.has(info.id)).length;
              const state: IconName =
                enabled === 0 ? 'checkbox-blank-outline' : enabled === ids.length ? 'checkbox-marked' : 'minus-box';
              return (
                <Pressable
                  key={system.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: enabled === ids.length && ids.length > 0, disabled: selectionLocked }}
                  disabled={selectionLocked || ids.length === 0}
                  onPress={() => app.setSystemPollEnabled(system.id, enabled < ids.length)}
                  style={({ pressed }) => [styles.systemRow, pressed && { opacity: 0.75 }]}
                >
                  <MaterialCommunityIcons name={state} size={24} color={enabled > 0 ? colors.neon : colors.textMuted} />
                  <MaterialCommunityIcons name={system.icon} size={20} color={accentColor(system.accent)} />
                  <Text style={styles.systemName}>{labelFor(system.title, locale)}</Text>
                  <Pill text={`${enabled}/${ids.length}`} color={enabled > 0 ? colors.live : colors.textDim} />
                </Pressable>
              );
            })}

            <ButtonRow>
              <Button compact variant="secondary" label={t('signalSelectionSelectAll')} disabled={selectionLocked} onPress={() => app.setAllPollEnabled(true)} />
              <Button compact variant="secondary" label={t('signalSelectionSelectNone')} disabled={selectionLocked} onPress={() => app.setAllPollEnabled(false)} />
              <Button compact variant="secondary" icon="restore" label={t('setupResetSelection')} disabled={selectionLocked} onPress={app.resetPollSelection} />
              <Button
                compact
                variant="ghost"
                icon={showAllIds ? 'chevron-up' : 'chevron-down'}
                label={`${t('sectionSignalSelection')} (${pollCatalog.length})`}
                onPress={() => setShowAllIds((current) => !current)}
              />
            </ButtonRow>

            {showAllIds
              ? pollCatalog.map((info) => {
                  const enabled = !disabledPollIds.has(info.id);
                  const category =
                    info.category === 'core'
                      ? t('signalSelectionCore')
                      : info.category === 'hv'
                        ? t('signalSelectionHv')
                        : t('signalSelectionSystemOnly');
                  return (
                    <Pressable
                      key={info.id}
                      disabled={selectionLocked}
                      onPress={() => app.togglePollId(info.id)}
                      style={({ pressed }) => [styles.idRow, pressed && { opacity: 0.75 }]}
                    >
                      <MaterialCommunityIcons
                        name={enabled ? 'check-circle' : 'checkbox-blank-circle-outline'}
                        size={20}
                        color={enabled ? colors.neon : colors.textDim}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.idLabel}>{info.label}</Text>
                        <Text style={styles.idMeta}>
                          {`0x${info.id.toString(16).toUpperCase()}${info.multiplexed ? ' · mux' : ''} · ${category}`}
                          {info.systems.length > 0
                            ? ` · ${info.systems
                                .map((id) => labelFor(SYSTEM_BY_ID[id].short, locale))
                                .join(', ')}`
                            : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              : null}
          </>
        ) : null}
      </Card>

      {/* 4. App preferences. */}
      <Card title={t('setupApp')} icon="cog-outline">
        <Text style={styles.subLabel}>{t('sectionLanguageSettings')}</Text>
        <Segmented<'en' | 'ro'>
          value={locale}
          onChange={app.setLocale}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ro', label: 'Română' },
          ]}
        />
        <Text style={styles.subLabel}>{t('themeLabel')}</Text>
        <Segmented<'system' | 'dark' | 'light'>
          value={app.themeMode}
          onChange={app.setThemeMode}
          options={[
            { value: 'system', label: t('themeSystem'), icon: 'theme-light-dark' },
            { value: 'dark', label: t('themeDark'), icon: 'weather-night' },
            { value: 'light', label: t('themeLight'), icon: 'white-balance-sunny' },
          ]}
        />
      </Card>

      {/* 5. Honest capability statement (read / calculate / write). */}
      <Card title={t('setupCapabilities')} icon="shield-check-outline" iconColor={colors.info}>
        <Capability icon="download-network-outline" color={colors.live} text={t('capRead')} />
        <Capability icon="calculator-variant-outline" color="#B39DFF" text={t('capCalc')} />
        <Capability icon="upload-off-outline" color={colors.warn} text={t('capWrite')} />
      </Card>
    </Screen>
  );
}

function Capability({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={styles.capRow}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={styles.capText}>{text}</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: TOUCH_TARGET + spacing.sm,
  },
  deviceRowActive: { borderColor: colors.live },
  deviceName: { color: colors.text, fontFamily: fonts.heading, fontSize: 15 },
  meta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  profileCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    minHeight: TOUCH_TARGET,
  },
  profileCardActive: { borderColor: colors.neon },
  profileTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 15 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  systemName: { color: colors.text, fontFamily: fonts.body, fontSize: 15, flex: 1 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  idLabel: { color: colors.text, fontFamily: fonts.body, fontSize: 13 },
  idMeta: { color: colors.textDim, fontFamily: fonts.mono, fontSize: 10 },
  subLabel: { color: colors.textMuted, fontFamily: fonts.heading, fontSize: 12 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addrInput: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  logBox: { gap: 2, paddingTop: spacing.sm },
  logLine: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11, lineHeight: 15 },
  capRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  capText: { color: colors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, flex: 1 },
  }),
);
