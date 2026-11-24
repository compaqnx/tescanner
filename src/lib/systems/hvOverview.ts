/**
 * High-voltage system overview: turns the live signal index into the status of
 * each HV component (pack, contactors, isolation, and the loads on the DC link),
 * for the schematic on the HV overview screen. Read-only, like the rest of the
 * app: every value comes from broadcast CAN data or is derived from it.
 *
 * Signal names cover both families (Model 3/Y DBC names and the SX_ names of the
 * legacy Model S/X powertrain DBC); the first fresh match wins.
 */

import { readSignal, type SignalIndex, type SignalReading } from './readSignals';
import type { Label, SignalSpec } from './systemCatalog';

/** ok = healthy/active · idle = present but not drawing power · warn · fault · unknown = no fresh data. */
export type HvStatus = 'ok' | 'idle' | 'warn' | 'fault' | 'unknown';

export interface HvNode {
  id: 'rearDu' | 'frontDu' | 'pcs' | 'compressor' | 'heater';
  label: Label;
  status: HvStatus;
  /** Main reading, already formatted with its unit (e.g. "12.4 kW"), or null. */
  primary: string | null;
  /** Secondary reading (e.g. inverter temperature), or null. */
  secondary: string | null;
}

export interface HvOverview {
  /** True when the HV bus is (or is inferred to be) energised. */
  energized: boolean;
  battery: {
    state: string | null;
    stateStatus: HvStatus;
    soc: string | null;
    voltage: string | null;
    current: string | null;
    power: string | null;
    hvil: string | null;
    hvilStatus: HvStatus;
    /** "92.4 %" when beginning-of-life energy is known, else nominal full pack. */
    health: string | null;
    healthLabel: Label;
  };
  contactors: {
    closed: boolean | null;
    text: string | null;
    status: HvStatus;
    /** True when "closed" is inferred from current flow, not a contactor signal. */
    inferred: boolean;
  };
  isolation: { text: string | null; status: HvStatus };
  nodes: HvNode[];
}

const L = (en: string, ro: string): Label => ({ en, ro });

function spec(id: string, names: string[], unit = '', digits = 1, kind?: 'state'): SignalSpec {
  return { id, label: L(id, id), names, unit, digits, kind };
}

const S = {
  bmsState: spec('bmsState', ['BMS_state', 'SX_bmsState'], '', 0, 'state'),
  hvState: spec('hvState', ['BMS_hvState'], '', 0, 'state'),
  soc: spec('soc', ['batterySocUi', 'SOCUI292', 'UI_SOC', 'BMS_uiSoC', 'SX_socUi'], '%', 1),
  voltage: spec('voltage', ['packVoltage', 'BattVoltage132', 'BMS_packVoltage', 'SX_packVoltage'], 'V', 1),
  current: spec('current', ['SmoothBattCurrent132', 'packCurrent', 'RawBattCurrent132', 'BMS_packCurrent', 'SX_packCurrent'], 'A', 1),
  hvil: spec('hvil', ['HVP_hvilStatus', 'SX_hvilStatus'], '', 0, 'state'),
  contactor: spec('contactor', ['HVP_packContactorSetState', 'BMS_contactorState', 'SX_contactorState'], '', 0, 'state'),
  isolation: spec('isolation', ['BMS_isolationResistance'], 'kΩ', 0),
  nominalFull: spec('nominalFull', ['nominalFullPackEnergy', 'BMS_nominalFullPackEnergy', 'SX_nominalFullPackEnergy'], 'kWh', 1),
  bolEnergy: spec('bolEnergy', ['BattBeginningOfLifeEnergy292'], 'kWh', 1),
  rearPower: spec('rearPower', ['RearPower266', 'SX_rearMechPower'], 'kW', 1),
  rearTemp: spec('rearTemp', ['RearTempInverter315', 'SX_rearInverterTemp'], '°C', 0),
  frontPower: spec('frontPower', ['FrontPower2E5', 'SX_frontMechPower'], 'kW', 1),
  frontTemp: spec('frontTemp', ['TempInverter376'], '°C', 0),
  dcdcCurrent: spec('dcdcCurrent', ['DCDCoutputCurrent224', 'PCS_dcdcLvOutputCurrent', 'SX_dcdcOutputCurrent'], 'A', 1),
  dcdcInput: spec('dcdcInput', ['SX_dcdcInputPower'], 'W', 0),
  lvVoltage: spec('lvVoltage', ['PCS_dcdcLvBusVolt', 'SX_dcdcOutputVoltage', 'v12vBattVoltage261', 'SX_rearInverter12V'], 'V', 2),
  dcdcFault: spec('dcdcFault', ['DCDCFaulted224'], '', 0, 'state'),
  cmpdPower: spec('cmpdPower', ['CMPD_inputHVPower'], 'W', 0),
  cmpdState: spec('cmpdState', ['CMPD_state', 'CMP_state'], '', 0, 'state'),
  ptcLeft: spec('ptcLeft', ['PTC_leftCurrentHV'], 'A', 1),
  ptcRight: spec('ptcRight', ['PTC_rightCurrentHV'], 'A', 1),
  heaterState: spec('heaterState', ['SX_batteryHeaterState'], '', 0, 'state'),
  heaterTemp: spec('heaterTemp', ['SX_batteryHeaterTemp'], '°C', 0),
};

// How long a reading stays on screen without a new frame. The filtered poll plan
// revisits each id only once per cycle (several seconds), and values are cleared
// on disconnect anyway, so a short limit just made the view blink to "--".
const HV_STALE_MS = 30_000;

function fresh(reading: SignalReading, now: number): boolean {
  return reading.value !== null && reading.updatedAt !== null && now - reading.updatedAt <= HV_STALE_MS;
}

function formatted(reading: SignalReading, now: number): string | null {
  if (!fresh(reading, now)) {
    return null;
  }
  return reading.unit ? `${reading.text} ${reading.unit}` : reading.text;
}

/** Human form of a DBC enum label: "BMS_CTRSET_CLOSED" -> "Closed". */
export function prettyState(text: string | null): string | null {
  if (!text) {
    return null;
  }
  const cleaned = text
    .replace(/^(BMS_CTRSET_|BMS_|HV_|CMPD_STATE_|PCS_CHARGE_|DI_)/, '')
    .replace(/_/g, ' ')
    .toLowerCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function stateStatus(text: string | null): HvStatus {
  if (!text) {
    return 'unknown';
  }
  if (/FAULT|WELD|BLOCKED|ERROR|OPEN_FAULT/i.test(text)) {
    return 'fault';
  }
  // A bare number means the DBC has no labels for this state: report, don't judge.
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) {
    return 'unknown';
  }
  return 'ok';
}

function powerNodeStatus(power: SignalReading, now: number, extraFault = false): HvStatus {
  if (extraFault) {
    return 'fault';
  }
  if (!fresh(power, now)) {
    return 'unknown';
  }
  return Math.abs(power.value ?? 0) >= 0.1 ? 'ok' : 'idle';
}

export function buildHvOverview(index: SignalIndex, now = Date.now()): HvOverview {
  const r = (key: keyof typeof S) => readSignal(S[key], index);

  const voltage = r('voltage');
  const current = r('current');
  const power =
    fresh(voltage, now) && fresh(current, now)
      ? `${(((voltage.value ?? 0) * (current.value ?? 0)) / 1000).toFixed(1)} kW`
      : null;

  // Contactors: trust an explicit contactor state; otherwise infer "closed"
  // from current flowing through the pack (it cannot flow with them open).
  const contactor = r('contactor');
  const contactorText = fresh(contactor, now) ? contactor.text : null;
  let closed: boolean | null = null;
  let inferred = false;
  if (contactorText && /CLOSED/i.test(contactorText) && !/CLOSING/i.test(contactorText)) {
    closed = true;
  } else if (contactorText && /OPEN/i.test(contactorText)) {
    closed = false;
  } else if (fresh(current, now) && Math.abs(current.value ?? 0) >= 0.5) {
    closed = true;
    inferred = true;
  }
  const contactorStatus: HvStatus = contactorText && stateStatus(contactorText) === 'fault'
    ? 'fault'
    : closed === true
      ? 'ok'
      : closed === false
        ? 'idle'
        : 'unknown';

  const isolation = r('isolation');
  const isolationStatus: HvStatus = !fresh(isolation, now)
    ? 'unknown'
    : (isolation.value ?? 0) < 100
      ? 'fault'
      : (isolation.value ?? 0) < 500
        ? 'warn'
        : 'ok';

  const bmsState = r('bmsState');
  const hvState = r('hvState');
  const stateText = fresh(bmsState, now) ? bmsState.text : fresh(hvState, now) ? hvState.text : null;

  const hvil = r('hvil');
  const hvilText = fresh(hvil, now) ? hvil.text : null;
  const hvilStatus: HvStatus = !hvilText
    ? 'unknown'
    : /STATUS_OK/i.test(hvilText)
      ? 'ok'
      : /FAULT|NO_12V/i.test(hvilText)
        ? 'fault'
        : 'unknown';

  const nominal = r('nominalFull');
  const bol = r('bolEnergy');
  const capacityPct =
    fresh(nominal, now) && fresh(bol, now) && (bol.value ?? 0) > 0
      ? `${(((nominal.value ?? 0) / (bol.value ?? 1)) * 100).toFixed(1)} %`
      : null;

  // DC link loads.
  const rearPower = r('rearPower');
  const frontPower = r('frontPower');
  const dcdcCurrent = r('dcdcCurrent');
  const dcdcInput = r('dcdcInput');
  const lvVoltage = r('lvVoltage');
  const dcdcFault = r('dcdcFault');
  const cmpdPower = r('cmpdPower');
  const cmpdState = r('cmpdState');
  const ptcLeft = r('ptcLeft');
  const ptcRight = r('ptcRight');
  const heaterState = r('heaterState');
  const heaterTemp = r('heaterTemp');

  const dcdcFaulted = fresh(dcdcFault, now) && (dcdcFault.value ?? 0) !== 0;
  const pcsActivity = fresh(dcdcInput, now) ? dcdcInput : dcdcCurrent;

  const ptcAmps =
    fresh(ptcLeft, now) || fresh(ptcRight, now)
      ? (fresh(ptcLeft, now) ? ptcLeft.value ?? 0 : 0) + (fresh(ptcRight, now) ? ptcRight.value ?? 0 : 0)
      : null;
  const heaterStatus: HvStatus =
    ptcAmps !== null
      ? ptcAmps >= 0.2
        ? 'ok'
        : 'idle'
      : fresh(heaterState, now)
        ? (heaterState.value ?? 0) !== 0
          ? 'ok'
          : 'idle'
        : fresh(heaterTemp, now)
          ? 'idle'
          : 'unknown';

  const cmpdStateText = fresh(cmpdState, now) ? cmpdState.text : null;

  const nodes: HvNode[] = [
    {
      id: 'rearDu',
      label: L('Rear drive unit', 'Motor spate'),
      status: powerNodeStatus(rearPower, now),
      primary: formatted(rearPower, now),
      secondary: formatted(r('rearTemp'), now),
    },
    {
      id: 'frontDu',
      label: L('Front drive unit', 'Motor fata'),
      status: powerNodeStatus(frontPower, now),
      primary: formatted(frontPower, now),
      secondary: formatted(r('frontTemp'), now),
    },
    {
      id: 'pcs',
      label: L('DC-DC / PCS', 'DC-DC / PCS'),
      status: powerNodeStatus(pcsActivity, now, dcdcFaulted),
      primary: formatted(pcsActivity, now),
      secondary: formatted(lvVoltage, now),
    },
    {
      id: 'compressor',
      label: L('A/C compressor', 'Compresor A/C'),
      status: cmpdStateText && stateStatus(cmpdStateText) === 'fault' ? 'fault' : powerNodeStatus(cmpdPower, now),
      primary: formatted(cmpdPower, now),
      secondary: prettyState(cmpdStateText),
    },
    {
      id: 'heater',
      label: L('PTC / battery heater', 'Incalzitor PTC / baterie'),
      status: heaterStatus,
      primary: ptcAmps !== null ? `${ptcAmps.toFixed(1)} A` : prettyState(fresh(heaterState, now) ? heaterState.text : null),
      secondary: formatted(heaterTemp, now),
    },
  ];

  const anyLoadActive = nodes.some((node) => node.status === 'ok' && (node.id === 'rearDu' || node.id === 'frontDu'));

  return {
    energized: closed === true || anyLoadActive,
    battery: {
      state: prettyState(stateText),
      stateStatus: stateStatus(stateText),
      soc: formatted(r('soc'), now),
      voltage: formatted(voltage, now),
      current: formatted(current, now),
      power,
      hvil: prettyState(hvilText),
      hvilStatus,
      health: capacityPct ?? formatted(nominal, now),
      healthLabel: capacityPct ? L('Capacity vs. new', 'Capacitate fata de nou') : L('Nominal full pack', 'Pachet plin nominal'),
    },
    contactors: {
      closed,
      text: prettyState(contactorText),
      status: contactorStatus,
      inferred,
    },
    isolation: { text: formatted(isolation, now), status: isolationStatus },
    nodes,
  };
}
