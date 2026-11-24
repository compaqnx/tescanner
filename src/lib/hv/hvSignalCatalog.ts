export interface SignalLike {
  key: string;
  signalName: string;
  label: string;
  messageName: string;
  value: number;
  displayValue: string;
  updatedAt: number;
}

export interface HvCellSample {
  key: string;
  index: number;
  signalName: string;
  value: number;
  displayValue: string;
  updatedAt: number;
}

const CELL_SIGNAL_PATTERNS = [
  /^Brick(\d{1,3})$/i,
  /^Cell(\d{1,3})$/i,
  /^BMS_?brick(?:Voltage)?(?:Cell)?(\d{1,3})$/i,
  /(?:Brick|Cell)(\d{1,3})$/i,
];

export const HV_ACCESSORY_PRIORITIES = [
  'BMS_isolationResistance',
  'BMS_hvState',
  'BattBrickVoltageMin332',
  'BattBrickVoltageMax332',
  'BattBrickTempMin332',
  'BattBrickTempMax332',
  'BMSminPackTemperature',
  'BMSmaxPackTemperature',
  'BMS_nominalFullPackEnergy',
  'BMS_maxDischargePower',
  'ChargeLineVoltage264',
  'ChargeLineCurrent264',
  'ChargeLinePower264',
  'CMPD_inputHVVoltage',
  'CMPD_inputHVCurrent',
  'CMPD_inputHVPower',
  'DCDCoutputCurrent224',
  'DIF_busbarTemp',
  'DIR_busbarTemp',
];

// Display order only for the Model S/X powertrain bus. Kept out of
// HV_ACCESSORY_PRIORITIES, which also decides what the poll plan enables by default.
const SX_DISPLAY_PRIORITIES = [
  'SX_packVoltage',
  'SX_packCurrent',
  'SX_brickVoltageMin',
  'SX_brickVoltageMax',
  'SX_moduleTempMin',
  'SX_moduleTempMax',
  'SX_nominalFullPackEnergy',
  'SX_nominalEnergyRemaining',
  'SX_expectedEnergyRemaining',
  'SX_idealEnergyRemaining',
  'SX_energyBuffer',
  'SX_energyToChargeComplete',
  'SX_maxDischargePower',
  'SX_maxRegenPower',
  'SX_batteryInletTemp',
  'SX_batteryHeaterTemp',
  'SX_dcdcOutputVoltage',
  'SX_dcdcOutputCurrent',
  'SX_dcdcInputPower',
];

const ACCESSORY_REGEX = /(isolation|insulation|pack|charge|dcdc|coolant|hv|voltage|current|temperature|temp|resistance)/i;

function getCellIndex(signalName: string): number | null {
  for (const pattern of CELL_SIGNAL_PATTERNS) {
    const match = signalName.match(pattern);
    if (!match) {
      continue;
    }

    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 999) {
      return parsed;
    }
  }

  return null;
}

export function isHvCellSignal(signalName: string): boolean {
  return getCellIndex(signalName) !== null;
}

export function pickHvCellSignals(signals: SignalLike[]): HvCellSample[] {
  const byIndex = new Map<number, HvCellSample>();

  for (const signal of signals) {
    const index = getCellIndex(signal.signalName);
    if (index === null) {
      continue;
    }

    const existing = byIndex.get(index);
    if (!existing || signal.updatedAt >= existing.updatedAt) {
      byIndex.set(index, {
        key: signal.key,
        index,
        signalName: signal.signalName,
        value: signal.value,
        displayValue: signal.displayValue,
        updatedAt: signal.updatedAt,
      });
    }
  }

  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

// Per-module temperature sensors (S/X 0x6F2 mux 24-31: SX_moduleTemp1..32).
const MODULE_TEMP_PATTERN = /moduleTemp(\d{1,3})$/i;

export function isHvModuleTempSignal(signalName: string): boolean {
  return MODULE_TEMP_PATTERN.test(signalName);
}

/** Module temperature sensors, ordered by sensor number (0-based `index`). */
export function pickHvModuleTemps(signals: SignalLike[]): HvCellSample[] {
  const byIndex = new Map<number, HvCellSample>();

  for (const signal of signals) {
    const match = signal.signalName.match(MODULE_TEMP_PATTERN);
    if (!match) {
      continue;
    }
    const index = Number(match[1]) - 1;
    if (index < 0) {
      continue;
    }
    const existing = byIndex.get(index);
    if (!existing || signal.updatedAt >= existing.updatedAt) {
      byIndex.set(index, {
        key: signal.key,
        index,
        signalName: signal.signalName,
        value: signal.value,
        displayValue: signal.displayValue,
        updatedAt: signal.updatedAt,
      });
    }
  }

  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

/**
 * Temperature to show for each brick. A Model S/X module holds 6 bricks and 2
 * sensors, so every sensor covers 3 neighbouring bricks (84 bricks / 28 sensors,
 * 96 / 32). The brick count is rounded up to a whole number of sensor groups so
 * an unpopulated last slot does not shift the mapping. Returns null for a brick
 * whose sensor has not reported yet.
 */
export function brickTemperatureLookup(
  cells: HvCellSample[],
  temps: HvCellSample[],
): (brickIndex: number) => number | null {
  if (cells.length === 0 || temps.length === 0) {
    return () => null;
  }

  const sensorCount = temps[temps.length - 1].index + 1;
  const brickSlots = cells[cells.length - 1].index + 1;
  const bricksPerSensor = Math.max(1, Math.ceil(brickSlots / sensorCount));
  const bySensor = new Map(temps.map((temp) => [temp.index, temp.value] as const));

  return (brickIndex) => {
    const sensor = Math.min(sensorCount - 1, Math.floor(brickIndex / bricksPerSensor));
    return bySensor.get(sensor) ?? null;
  };
}

export function pickHvAccessorySignals(signals: SignalLike[], maxCount = 14): SignalLike[] {
  const byName = new Map<string, SignalLike>();

  for (const signal of signals) {
    if (!byName.has(signal.signalName) || signal.updatedAt >= (byName.get(signal.signalName)?.updatedAt ?? 0)) {
      byName.set(signal.signalName, signal);
    }
  }

  const prioritized: SignalLike[] = [];
  for (const name of [...HV_ACCESSORY_PRIORITIES, ...SX_DISPLAY_PRIORITIES]) {
    const signal = byName.get(name);
    if (signal) {
      prioritized.push(signal);
    }
  }

  // A fixed order (priority list, then alphabetical) so rows never jump around
  // as values update; sorting by update time reshuffled the list on every frame.
  // Per-brick voltages and per-module temperatures belong to the cell map.
  const prioritizedNames = new Set(prioritized.map((signal) => signal.signalName));
  const discovered = Array.from(byName.values())
    .filter(
      (signal) =>
        !prioritizedNames.has(signal.signalName) &&
        !isHvCellSignal(signal.signalName) &&
        !isHvModuleTempSignal(signal.signalName) &&
        ACCESSORY_REGEX.test(signal.signalName),
    )
    .sort((a, b) => a.signalName.localeCompare(b.signalName));

  return [...prioritized, ...discovered].slice(0, maxCount);
}
