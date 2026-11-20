export type VehicleProfileId = 'model3y' | 'modelsx_powertrain' | 'modelsx_2015_2021';

export interface CanonicalSignalAlias {
  canonicalName: string;
  label: string;
  aliases: string[];
}

export interface VehicleProfileDefinition {
  id: VehicleProfileId;
  name: string;
  description: string;
  dbcAssets: number[];
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

const MODELSX_2015_2021_ALIASES: CanonicalSignalAlias[] = [
  {
    canonicalName: 'vehicleSpeed',
    label: 'Vehicle Speed',
    aliases: ['DI_vehicleSpeed', 'ESP_vehicleSpeed', 'DI_digitalSpeed', 'DI_analogSpeed', 'UI_TCR_vehSpeed'],
  },
  {
    canonicalName: 'gear',
    label: 'Gear',
    aliases: ['DI_gear', 'DI_gearRequest'],
  },
  {
    canonicalName: 'regenIndicator',
    label: 'Regen Indicator',
    aliases: ['DI_regenLight'],
  },
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
  {
    canonicalName: 'tegraCoreTemp',
    label: 'MCU Core Temp',
    aliases: ['UI_tegraCoreTemperature'],
  },
  {
    canonicalName: 'tegraAmbientTemp',
    label: 'MCU Ambient Temp',
    aliases: ['UI_tegraAmbientTemperature'],
  },
];

/**
 * Legacy Model S/X powertrain bus (the bus the Scan My Tesla S/X harness taps):
 * battery, cells, drive units, DC-DC and thermal from TeslaSx_powertrain_battery.dbc,
 * plus drive basics from openDBC tesla_powertrain.dbc.
 */
const MODELSX_POWERTRAIN_ALIASES: CanonicalSignalAlias[] = [
  { canonicalName: 'vehicleSpeed', label: 'Vehicle Speed', aliases: ['SX_vehicleSpeedKph'] },
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
    id: 'modelsx_powertrain',
    name: 'Model S / X – battery & powertrain',
    description:
      'Legacy Model S/X (2012-2021) powertrain bus: pack, 96 cells, drive units, DC-DC, thermal. Use with a Scan My Tesla-style S/X harness.',
    dbcAssets: [
      require('../../../assets/can/TeslaSx_powertrain_battery.dbc'),
      require('../../../assets/can/TeslaSx_tesla_powertrain.dbc'),
    ],
    watchSignals: MODELSX_POWERTRAIN_ALIASES.map((entry) => entry.canonicalName),
    dashboardPrimaryMetrics: ['vehicleSpeed', 'batterySocUi', 'packVoltage', 'packCurrent'],
    dashboardSecondaryMetrics: [
      'gear',
      'nominalFullPackEnergy',
      'minBrickVoltage',
      'maxBrickVoltage',
      'maxRegenPower',
      'outsideTemp',
      'driveTorque',
    ],
    aliases: MODELSX_POWERTRAIN_ALIASES,
  },
  {
    id: 'modelsx_2015_2021',
    name: 'Model S / X – chassis & driver assist',
    description: 'Legacy Model S and X chassis bus using openDBC tesla_can + tesla_powertrain.',
    dbcAssets: [
      require('../../../assets/can/TeslaSx_tesla_can.dbc'),
      require('../../../assets/can/TeslaSx_tesla_powertrain.dbc'),
    ],
    watchSignals: MODELSX_2015_2021_ALIASES.map((entry) => entry.canonicalName),
    dashboardPrimaryMetrics: [
      'vehicleSpeed',
      'gear',
      'cruiseSetSpeed',
      'speedLimit',
      'regenIndicator',
    ],
    dashboardSecondaryMetrics: ['tegraCoreTemp', 'tegraAmbientTemp'],
    aliases: MODELSX_2015_2021_ALIASES,
  },
];

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
