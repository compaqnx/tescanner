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

export function pickHvAccessorySignals(signals: SignalLike[], maxCount = 14): SignalLike[] {
  const byName = new Map<string, SignalLike>();

  for (const signal of signals) {
    if (!byName.has(signal.signalName) || signal.updatedAt >= (byName.get(signal.signalName)?.updatedAt ?? 0)) {
      byName.set(signal.signalName, signal);
    }
  }

  const prioritized: SignalLike[] = [];
  for (const name of HV_ACCESSORY_PRIORITIES) {
    const signal = byName.get(name);
    if (signal) {
      prioritized.push(signal);
    }
  }

  const prioritizedNames = new Set(prioritized.map((signal) => signal.signalName));
  const discovered = Array.from(byName.values())
    .filter((signal) => !prioritizedNames.has(signal.signalName) && ACCESSORY_REGEX.test(signal.signalName))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return [...prioritized, ...discovered].slice(0, maxCount);
}
