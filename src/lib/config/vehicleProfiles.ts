export type VehicleProfileId = 'model3y' | 'modelsx';
export type BusKind = 'powertrain' | 'chassis';

export interface CanonicalSignalAlias {
  canonicalName: string;
  label: string;
  aliases: string[];
}

export interface VehicleProfileDefinition {
  id: VehicleProfileId;
  name: string;
  description: string;
  /** DBC set for the default bus (the powertrain bus on legacy S/X). */
  dbcAssets: number[];
  /** DBC set used instead when the adapter turns out to be on the chassis bus. */
  chassisDbcAssets?: number[];
  watchSignals: string[];
  dashboardPrimaryMetrics: string[];
  dashboardSecondaryMetrics: string[];
  aliases: CanonicalSignalAlias[];
}

const MODEL3Y_ALIASES: CanonicalSignalAlias[] = [
  {
    canonicalName: 'vehicleSpeed',
    label: 'Vehicle Speed',
    aliases: ['DI_speed', 'DI_vehicleSpeed', 'ESP_vehicleSpeed', 'DI_digitalSpeed', 'DI_analogSpeed'],
  },
  {
    canonicalName: 'gear',
    label: 'Gear',
    aliases: ['DI_gear'],
  },
  {
    canonicalName: 'batteryBar',
    label: 'Battery Bar',
    aliases: ['UI_batteryBar', 'UI_SOC'],
  },
  {
    canonicalName: 'idealRange',
    label: 'Ideal Range',
    aliases: ['UI_idealRange', 'UI_Range'],
  },
  {
    canonicalName: 'maxRegenPower',
    label: 'Max Regen Power',
    aliases: ['BMS_maxRegenPower', 'SystemRegenPowerMax268'],
  },
  {
    canonicalName: 'nominalFullPackEnergy',
    label: 'Nominal Full Pack',
    aliases: ['BMS_nominalFullPackEnergy'],
  },
  {
    canonicalName: 'batterySocUi',
    label: 'Battery SoC (UI)',
    aliases: ['BMS_uiSoC', 'UI_SOC'],
  },
  {
    canonicalName: 'batterySocReal',
    label: 'Battery SoC (Real)',
    aliases: ['BMS_realSoC'],
  },
  {
    canonicalName: 'packVoltage',
    label: 'Pack Voltage',
    aliases: ['BMS_packVoltage', 'HVP_dcLinkVoltageFiltered'],
  },
  {
    canonicalName: 'packCurrent',
    label: 'Pack Current',
    aliases: ['BMS_packCurrent', 'BMS_batteryCurrent', 'HVP_dcLinkCurrent'],
  },
  {
    canonicalName: 'hvPower',
    label: 'HV Power',
    aliases: ['BMS_hvPower', 'BMS_maxDischargePower', 'BMS_chgPowerAvailable'],
  },
  {
    canonicalName: 'minBrickVoltage',
    label: 'Min Brick Voltage',
    aliases: ['BMS_minBrickVoltage'],
  },
  {
    canonicalName: 'maxBrickVoltage',
    label: 'Max Brick Voltage',
    aliases: ['BMS_maxBrickVoltage'],
  },
  {
    canonicalName: 'avgBrickTemp',
    label: 'Average Brick Temp',
    aliases: ['BMS_avgBrickTemp'],
  },
  {
    canonicalName: 'outsideTemp',
    label: 'Outside Temp',
    aliases: ['DI_outsideTemp'],
  },
  {
    canonicalName: 'driveTorque',
    label: 'Torque',
    aliases: ['DI_torque'],
  },
  {
    canonicalName: 'drivePower',
    label: 'Drive Power',
    aliases: ['DI_power', 'SystemDrivePower268'],
  },
];

/**
 * Legacy Model S/X (2012-2021, pre-Palladium) — one profile for both buses the
 * adapter may see: the powertrain bus (battery, cells, drive units, DC-DC,
 * thermal; what a Scan My Tesla-style S/X harness taps) and the chassis bus
 * (driver assist, cruise, speed limits, MCU temps). DBC order matters where the
 * two buses reuse an id: the powertrain definitions come first and win.
 */
const MODELSX_ALIASES: CanonicalSignalAlias[] = [
  // km/h sources only, so the speed tile never flips between MPH and km/h.
  // ESP_vehicleSpeed exists only on the chassis bus (its DBC is not loaded on the powertrain bus).
  { canonicalName: 'vehicleSpeed', label: 'Vehicle Speed', aliases: ['SX_vehicleSpeedKph', 'ESP_vehicleSpeed'] },
  { canonicalName: 'gear', label: 'Gear', aliases: ['DI_gear'] },
  { canonicalName: 'batterySocUi', label: 'Battery SoC (UI)', aliases: ['SX_socUi'] },
  { canonicalName: 'packVoltage', label: 'Pack Voltage', aliases: ['SX_packVoltage'] },
  { canonicalName: 'packCurrent', label: 'Pack Current', aliases: ['SX_packCurrent'] },
  { canonicalName: 'nominalFullPackEnergy', label: 'Nominal Full Pack', aliases: ['SX_nominalFullPackEnergy'] },
  { canonicalName: 'minBrickVoltage', label: 'Min Brick Voltage', aliases: ['SX_brickVoltageMin'] },
  { canonicalName: 'maxBrickVoltage', label: 'Max Brick Voltage', aliases: ['SX_brickVoltageMax'] },
  { canonicalName: 'maxRegenPower', label: 'Max Regen Power', aliases: ['SX_maxRegenPower'] },
  { canonicalName: 'outsideTemp', label: 'Outside Temp', aliases: ['SX_outsideTemp'] },
  { canonicalName: 'driveTorque', label: 'Torque', aliases: ['SX_rearTorqueMeasured'] },
  { canonicalName: 'regenIndicator', label: 'Regen Indicator', aliases: ['DI_regenLight'] },
  {
    canonicalName: 'cruiseSetSpeed',
    label: 'Cruise Set Speed',
    aliases: ['DI_cruiseSet', 'DAS_setSpeed', 'DAS_locSpeed', 'DAS_accSpeedLimit'],
  },
  {
    canonicalName: 'speedLimit',
    label: 'Speed Limit',
    aliases: ['UI_mapSpeedLimit', 'UI_mppSpeedLimit', 'DAS_fusedSpeedLimit', 'DAS_visionOnlySpeedLimit'],
  },
  { canonicalName: 'tegraCoreTemp', label: 'MCU Core Temp', aliases: ['UI_tegraCoreTemperature'] },
  { canonicalName: 'tegraAmbientTemp', label: 'MCU Ambient Temp', aliases: ['UI_tegraAmbientTemperature'] },
];

export const VEHICLE_PROFILES: VehicleProfileDefinition[] = [
  {
    id: 'model3y',
    name: 'Model 3 / Y',
    description: 'Model 3 and Model Y telemetry based on Model3CAN.dbc.',
    dbcAssets: [require('../../../assets/can/Model3CAN.dbc')],
    watchSignals: MODEL3Y_ALIASES.map((entry) => entry.canonicalName),
    dashboardPrimaryMetrics: [
      'vehicleSpeed',
      'batterySocUi',
      'packVoltage',
      'packCurrent',
      'hvPower',
      'idealRange',
    ],
    dashboardSecondaryMetrics: [
      'gear',
      'maxRegenPower',
      'nominalFullPackEnergy',
      'drivePower',
      'driveTorque',
      'outsideTemp',
      'avgBrickTemp',
      'minBrickVoltage',
      'maxBrickVoltage',
      'batterySocReal',
    ],
    aliases: MODEL3Y_ALIASES,
  },
  {
    id: 'modelsx',
    name: 'Model S / X',
    description:
      'Legacy Model S/X (2012-2021): battery & powertrain (pack, cells, drive units, DC-DC, thermal) plus chassis & driver assist (cruise, speed limits, MCU temps).',
    // The two buses reuse ids for different messages (0x155, 0x368, 0x2BF, ... on
    // the powertrain bus are not ESP_B / DI_state / DAS_control), so only one
    // set is ever applied: the bus is picked when the car is identified.
    dbcAssets: [
      require('../../../assets/can/TeslaSx_powertrain_battery.dbc'),
      require('../../../assets/can/TeslaSx_tesla_powertrain.dbc'),
    ],
    chassisDbcAssets: [
      require('../../../assets/can/TeslaSx_tesla_can.dbc'),
      require('../../../assets/can/TeslaSx_tesla_powertrain.dbc'),
    ],
    watchSignals: MODELSX_ALIASES.map((entry) => entry.canonicalName),
    dashboardPrimaryMetrics: ['vehicleSpeed', 'batterySocUi', 'packVoltage', 'packCurrent'],
    dashboardSecondaryMetrics: [
      'gear',
      'nominalFullPackEnergy',
      'minBrickVoltage',
      'maxBrickVoltage',
      'maxRegenPower',
      'outsideTemp',
      'driveTorque',
      'cruiseSetSpeed',
      'speedLimit',
    ],
    aliases: MODELSX_ALIASES,
  },
];

/** Profile ids from earlier versions, mapped onto the current ones. */
const LEGACY_PROFILE_IDS: Record<string, VehicleProfileId> = {
  modelsx_powertrain: 'modelsx',
  modelsx_2015_2021: 'modelsx',
};

export function normalizeProfileId(id: string | null | undefined): VehicleProfileId | null {
  if (!id) {
    return null;
  }
  if (id === 'model3y' || id === 'modelsx') {
    return id;
  }
  return LEGACY_PROFILE_IDS[id] ?? null;
}

export const DEFAULT_VEHICLE_PROFILE_ID: VehicleProfileId = 'model3y';

const PROFILE_BY_ID: Record<VehicleProfileId, VehicleProfileDefinition> = VEHICLE_PROFILES.reduce(
  (acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  },
  {} as Record<VehicleProfileId, VehicleProfileDefinition>,
);

export interface CanonicalSignalResolution {
  canonicalName: string;
  label: string;
}

export function getVehicleProfileById(profileId: VehicleProfileId): VehicleProfileDefinition {
  return PROFILE_BY_ID[profileId];
}

/** DBC assets for a profile on a bus ('all' = every set, de-duplicated). */
export function dbcAssetsFor(profileId: VehicleProfileId, bus: BusKind | 'all'): number[] {
  const profile = PROFILE_BY_ID[profileId];
  if (bus === 'chassis' && profile.chassisDbcAssets) {
    return profile.chassisDbcAssets;
  }
  if (bus === 'all' && profile.chassisDbcAssets) {
    return Array.from(new Set([...profile.dbcAssets, ...profile.chassisDbcAssets]));
  }
  return profile.dbcAssets;
}

/** True when the profile has separate powertrain and chassis DBC sets. */
export function hasBusVariants(profileId: VehicleProfileId): boolean {
  return Boolean(PROFILE_BY_ID[profileId].chassisDbcAssets);
}

export function buildAliasLookup(profile: VehicleProfileDefinition): Map<string, CanonicalSignalResolution> {
  const lookup = new Map<string, CanonicalSignalResolution>();

  for (const definition of profile.aliases) {
    const resolution: CanonicalSignalResolution = {
      canonicalName: definition.canonicalName,
      label: definition.label,
    };

    const keys = [definition.canonicalName, ...definition.aliases];
    for (const key of keys) {
      lookup.set(key, resolution);
      lookup.set(key.toLowerCase(), resolution);
    }
  }

  return lookup;
}
