/**
 * Battery state-of-health (SOH) estimate from broadcast BMS data.
 *
 * SOH (the number) is capacity retention, the industry definition:
 *   SOH = nominal full-pack energy now / nominal full-pack energy when new.
 * "When new" comes from the car itself where it broadcasts it (Model 3/Y
 * beginning-of-life energy), else from the user's pack choice, else from the
 * pack class implied by the number of bricks in series (legacy S/X).
 *
 * The verdict also weighs signs of uneven ageing that a capacity number alone
 * hides: cell (brick) imbalance, one weak brick sagging below the rest, and
 * module temperature spread. Lifetime energy throughput is reported as context.
 * Faults (isolation, HVIL) override the verdict.
 *
 * Read-only and passive: nothing here asks the car to run a test, so the
 * estimate is only as fresh as the BMS's own capacity estimate.
 */

import type { HvCellSample } from '../hv/hvSignalCatalog';
import type { SignalIndex } from './readSignals';
import type { Label } from './systemCatalog';

export type SohVerdict = 'excellent' | 'good' | 'fair' | 'poor' | 'check' | 'unknown';
export type FactorState = 'good' | 'watch' | 'bad' | 'info' | 'missing';

export interface SohFactor {
  id: 'capacity' | 'balance' | 'weakest' | 'temperature' | 'throughput' | 'faults';
  label: Label;
  /** Formatted value, e.g. "63.2 / 75.0 kWh". */
  value: string | null;
  state: FactorState;
  detail?: Label;
}

export type ReferenceSource = 'car' | 'user' | 'pack-class' | 'none';

export interface BatteryHealth {
  /** Capacity retention in %, or null until the BMS reports its capacity. */
  soh: number | null;
  verdict: SohVerdict;
  /** Why the verdict differs from what the SOH number alone would give. */
  verdictReason: Label | null;
  referenceKwh: number | null;
  referenceSource: ReferenceSource;
  factors: SohFactor[];
}

const L = (en: string, ro: string): Label => ({ en, ro });

/**
 * Nominal energy of a new pack by bricks in series for legacy Model S/X.
 * 84s = 14 modules (60/70/75 kWh class: the 2016+ "75" is the common one);
 * 96s = 16 modules (85/90/100 kWh): ambiguous, so the user must choose.
 */
const SX_PACK_BY_SERIES: Record<number, number | null> = { 84: 75, 96: null };

function value(index: SignalIndex, names: string[]): number | null {
  for (const name of names) {
    const signal = index.get(name);
    if (signal && Number.isFinite(signal.value)) {
      return signal.value;
    }
  }
  return null;
}

export interface BatteryHealthInput {
  index: SignalIndex;
  cells: HvCellSample[];
  /** User's "original pack capacity" in kWh, or null for automatic. */
  userReferenceKwh: number | null;
}

function scoreToState(score: number): FactorState {
  return score >= 80 ? 'good' : score >= 55 ? 'watch' : 'bad';
}

function baseVerdict(soh: number): SohVerdict {
  if (soh >= 90) return 'excellent';
  if (soh >= 80) return 'good';
  if (soh >= 70) return 'fair';
  return 'poor';
}

const ORDER: SohVerdict[] = ['excellent', 'good', 'fair', 'poor'];

function downgrade(verdict: SohVerdict): SohVerdict {
  const i = ORDER.indexOf(verdict);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : verdict;
}

export function computeBatteryHealth({ index, cells, userReferenceKwh }: BatteryHealthInput): BatteryHealth {
  const factors: SohFactor[] = [];

  // 1. Capacity retention.
  const nominalFull = value(index, ['nominalFullPackEnergy', 'BMS_nominalFullPackEnergy', 'SX_nominalFullPackEnergy']);
  const bol = value(index, ['BattBeginningOfLifeEnergy292']);
  const series = cells.length > 0 ? cells[cells.length - 1].index + 1 : 0;
  const packClass = SX_PACK_BY_SERIES[series] ?? null;

  let referenceKwh: number | null = null;
  let referenceSource: ReferenceSource = 'none';
  if (bol !== null && bol > 0) {
    referenceKwh = bol;
    referenceSource = 'car';
  } else if (userReferenceKwh !== null && userReferenceKwh > 0) {
    referenceKwh = userReferenceKwh;
    referenceSource = 'user';
  } else if (packClass !== null) {
    referenceKwh = packClass;
    referenceSource = 'pack-class';
  }

  const soh =
    nominalFull !== null && referenceKwh !== null ? Math.min(110, (nominalFull / referenceKwh) * 100) : null;

  factors.push({
    id: 'capacity',
    label: L('Capacity', 'Capacitate'),
    value:
      nominalFull === null
        ? null
        : referenceKwh === null
          ? `${nominalFull.toFixed(1)} kWh`
          : `${nominalFull.toFixed(1)} / ${referenceKwh.toFixed(1)} kWh`,
    state: soh === null ? (nominalFull === null ? 'missing' : 'info') : soh >= 80 ? 'good' : soh >= 70 ? 'watch' : 'bad',
    detail:
      referenceSource === 'car'
        ? L('Reference: beginning-of-life energy reported by the car.', 'Referinta: energia la inceput de viata raportata de masina.')
        : referenceSource === 'user'
          ? L('Reference: original capacity chosen in Setup.', 'Referinta: capacitatea originala aleasa in Setari.')
          : referenceSource === 'pack-class'
            ? L(`Reference assumed from ${series} bricks in series (${packClass} kWh class). Change it in Setup if wrong.`, `Referinta presupusa din ${series} grupuri in serie (clasa ${packClass} kWh). Modifica in Setari daca e gresit.`)
            : series === 96
              ? L('96 bricks: 85, 90 or 100 kWh pack — choose the original capacity in Setup.', '96 grupuri: pachet de 85, 90 sau 100 kWh — alege capacitatea originala in Setari.')
              : L('Original capacity unknown — choose it in Setup.', 'Capacitate originala necunoscuta — alege-o in Setari.'),
  });

  // 2. Cell balance: spread between highest and lowest brick.
  const vMax = value(index, ['BattBrickVoltageMax332', 'maxBrickVoltage', 'SX_brickVoltageMax']);
  const vMin = value(index, ['BattBrickVoltageMin332', 'minBrickVoltage', 'SX_brickVoltageMin']);
  let spreadMv: number | null = vMax !== null && vMin !== null ? (vMax - vMin) * 1000 : null;
  if (spreadMv === null && cells.length > 1) {
    const values = cells.map((cell) => cell.value);
    spreadMv = (Math.max(...values) - Math.min(...values)) * 1000;
  }
  // <=15 mV ideal; 50 mV is where balancing clearly struggles; 150 mV is bad.
  const balanceScore =
    spreadMv === null ? null : spreadMv <= 15 ? 100 : spreadMv <= 50 ? 100 - ((spreadMv - 15) / 35) * 40 : Math.max(0, 60 - ((spreadMv - 50) / 100) * 60);
  factors.push({
    id: 'balance',
    label: L('Cell balance', 'Echilibru celule'),
    value: spreadMv === null ? null : `${spreadMv.toFixed(0)} mV`,
    state: balanceScore === null ? 'missing' : scoreToState(balanceScore),
    detail: L('Spread between the highest and lowest brick.', 'Diferenta intre cel mai inalt si cel mai jos grup de celule.'),
  });

  // 3. Weakest brick: how far the lowest brick sags below the pack average.
  let weakestMv: number | null = null;
  let weakestIndex: number | null = null;
  if (cells.length >= 8) {
    const avg = cells.reduce((sum, cell) => sum + cell.value, 0) / cells.length;
    let low = cells[0];
    for (const cell of cells) {
      if (cell.value < low.value) low = cell;
    }
    weakestMv = (avg - low.value) * 1000;
    weakestIndex = low.index + 1;
  }
  const weakestScore =
    weakestMv === null ? null : weakestMv <= 10 ? 100 : Math.max(0, 100 - ((weakestMv - 10) / 50) * 100);
  factors.push({
    id: 'weakest',
    label: L('Weakest brick', 'Cel mai slab grup'),
    value: weakestMv === null ? null : `#${weakestIndex} · −${weakestMv.toFixed(0)} mV`,
    state: weakestScore === null ? 'missing' : scoreToState(weakestScore),
    detail: L('Below the pack average; a lone low brick ages the whole pack.', 'Sub media pachetului; un singur grup slab limiteaza tot pachetul.'),
  });

  // 4. Module temperature spread (uneven cooling ages modules unevenly).
  const tMax = value(index, ['BattBrickTempMax332', 'BMSmaxPackTemperature', 'SX_moduleTempMax']);
  const tMin = value(index, ['BattBrickTempMin332', 'BMSminPackTemperature', 'SX_moduleTempMin']);
  const tSpread = tMax !== null && tMin !== null ? tMax - tMin : null;
  factors.push({
    id: 'temperature',
    label: L('Temperature spread', 'Diferenta temperatura'),
    value: tSpread === null ? null : `${tSpread.toFixed(1)} °C`,
    state: tSpread === null ? 'missing' : tSpread <= 5 ? 'good' : tSpread <= 10 ? 'watch' : 'bad',
  });

  // 5. Lifetime throughput (context, not scored): equivalent full cycles.
  const acTotal = value(index, ['SX_acChargeTotal']);
  const dcTotal = value(index, ['SX_dcChargeTotal']);
  const charged = value(index, ['TotalChargeKWh3D2', 'SX_totalCharge']) ?? (acTotal !== null || dcTotal !== null ? (acTotal ?? 0) + (dcTotal ?? 0) : null);
  const cycleBase = referenceKwh ?? nominalFull;
  if (charged !== null && cycleBase !== null && cycleBase > 0) {
    const cycles = charged / cycleBase;
    const dcShare = acTotal !== null && dcTotal !== null && acTotal + dcTotal > 0 ? (dcTotal / (acTotal + dcTotal)) * 100 : null;
    factors.push({
      id: 'throughput',
      label: L('Lifetime charge', 'Energie incarcata total'),
      value: `${Math.round(charged).toLocaleString()} kWh · ~${Math.round(cycles)} cycles`,
      state: 'info',
      detail:
        dcShare === null
          ? L('Equivalent full cycles.', 'Cicluri complete echivalente.')
          : L(`Equivalent full cycles; ${dcShare.toFixed(0)} % from DC fast charging.`, `Cicluri complete echivalente; ${dcShare.toFixed(0)} % din incarcare rapida DC.`),
    });
  }

  // 6. Safety faults override everything.
  const isolation = value(index, ['BMS_isolationResistance']);
  const hvil = index.get('HVP_hvilStatus');
  const isolationBad = isolation !== null && isolation < 500;
  const hvilBad = hvil !== undefined && /FAULT|NO_12V/i.test(hvil.displayValue);
  if (isolation !== null || hvil !== undefined) {
    factors.push({
      id: 'faults',
      label: L('Safety checks', 'Verificari siguranta'),
      value: isolationBad || hvilBad ? 'Fault' : 'OK',
      state: isolationBad || hvilBad ? 'bad' : 'good',
      detail: isolationBad
        ? L(`Isolation resistance low (${isolation?.toFixed(0)} kΩ).`, `Rezistenta de izolatie scazuta (${isolation?.toFixed(0)} kΩ).`)
        : hvilBad
          ? L('HV interlock (HVIL) fault.', 'Defect interblocare HV (HVIL).')
          : undefined,
    });
  }

  // Verdict.
  let verdict: SohVerdict = soh === null ? 'unknown' : baseVerdict(soh);
  let verdictReason: Label | null = null;
  if (isolationBad || hvilBad) {
    verdict = 'check';
    verdictReason = L('A high-voltage safety check is failing.', 'O verificare de siguranta HV esueaza.');
  } else if (soh !== null) {
    const weakSigns = [balanceScore, weakestScore].filter((score) => score !== null && score < 55).length;
    if (weakSigns > 0) {
      verdict = downgrade(verdict);
      verdictReason = L(
        'Lowered one level: cells are ageing unevenly.',
        'Coborat un nivel: celulele imbatranesc inegal.',
      );
    }
  }

  return { soh, verdict, verdictReason, referenceKwh, referenceSource, factors };
}
