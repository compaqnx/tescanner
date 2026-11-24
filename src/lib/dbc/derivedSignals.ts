import type { DecodedSignal } from '../can/types';

/**
 * Signals computed from other fields of the same frame, emitted alongside the
 * decoded ones so every screen, alias and export sees them like any DBC signal.
 */

function find(decoded: DecodedSignal[], name: string): DecodedSignal | undefined {
  return decoded.find((signal) => signal.signalName === name);
}

function derived(base: DecodedSignal, name: string, value: number, unit: string, min: number, max: number): DecodedSignal {
  return {
    key: `${base.messageName}.${name}`,
    signalName: name,
    messageName: base.messageName,
    messageId: base.messageId,
    value,
    displayValue: `${value.toFixed(1)}${unit ? ` ${unit}` : ''}`,
    unit,
    min,
    max,
    raw: value,
  };
}

/**
 * Legacy Model S/X (0x382): the SoC the car displays excludes the bottom energy
 * buffer — (nominal remaining − buffer) / (nominal full − buffer). Verified on a
 * 2018 Model X: (30.8 − 6.0) / (63.2 − 6.0) = 43.4 % with the car showing 43 %,
 * while 0x302's BMS SoC (buffer included) read 48.6 %.
 */
function sxDisplayedSoc(decoded: DecodedSignal[]): DecodedSignal | null {
  const remaining = find(decoded, 'SX_nominalEnergyRemaining');
  const buffer = find(decoded, 'SX_energyBuffer');
  const full = find(decoded, 'SX_nominalFullPackEnergy');
  if (!remaining || !buffer || !full) {
    return null;
  }
  const usableFull = full.value - buffer.value;
  if (!(usableFull > 1)) {
    return null;
  }
  const soc = Math.min(100, Math.max(0, ((remaining.value - buffer.value) / usableFull) * 100));
  return derived(remaining, 'SX_socUi', soc, '%', 0, 100);
}

export function withDerivedSignals(decoded: DecodedSignal[]): DecodedSignal[] {
  const extra = sxDisplayedSoc(decoded);
  return extra ? [...decoded, extra] : decoded;
}
