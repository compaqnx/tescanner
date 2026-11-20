import type { LocaleCode } from '../i18n/localization';
import {
  Label,
  SignalSpec,
  SYSTEMS,
  SystemId,
  SystemSpec,
  findSignalSpec,
} from './systemCatalog';

export interface LiveSignalLike {
  signalName: string;
  value: number;
  displayValue: string;
  updatedAt: number;
}

export type SignalIndex = Map<string, LiveSignalLike>;

export interface SignalReading {
  spec: SignalSpec;
  value: number | null;
  /** Formatted value without unit, '--' when missing. */
  text: string;
  unit: string;
  updatedAt: number | null;
  /** Which source signal provided the value (read signals only). */
  source: string | null;
  warn: boolean;
}

export interface SystemAlert {
  key: string;
  systemId: SystemId;
  label: Label;
  text: string;
  unit: string;
  kind: 'low' | 'high';
}

/** A signal is considered stale after this long without an update. */
export const STALE_AFTER_MS = 5000;

export function labelFor(label: Label, locale: LocaleCode): string {
  return label[locale] ?? label.en;
}

export function buildSignalIndex(signals: LiveSignalLike[]): SignalIndex {
  const index: SignalIndex = new Map();
  for (const signal of signals) {
    const existing = index.get(signal.signalName);
    if (!existing || signal.updatedAt >= existing.updatedAt) {
      index.set(signal.signalName, signal);
    }
  }
  return index;
}

function firstMatch(index: SignalIndex, names: string[]): LiveSignalLike | null {
  for (const name of names) {
    const match = index.get(name);
    if (match && Number.isFinite(match.value)) {
      return match;
    }
  }
  return null;
}

function stripUnit(displayValue: string, unit: string): string {
  if (unit && displayValue.endsWith(` (${unit})`)) {
    return displayValue.slice(0, -(unit.length + 3));
  }
  return displayValue;
}

export function formatNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

export function readSignal(spec: SignalSpec, index: SignalIndex): SignalReading {
  const unit = spec.unit ?? '';

  if (spec.access === 'calc' && spec.calc) {
    let newest: number | null = null;
    const value = spec.calc((names) => {
      const match = firstMatch(index, names);
      if (match) {
        newest = Math.max(newest ?? 0, match.updatedAt);
      }
      return match ? match.value : null;
    });
    const finite = value !== null && Number.isFinite(value) ? value : null;
    return {
      spec,
      value: finite,
      text: formatNumber(finite, spec.digits),
      unit,
      updatedAt: newest,
      source: null,
      warn: isOutOfRange(spec, finite),
    };
  }

  const match = firstMatch(index, spec.names);
  if (!match) {
    return { spec, value: null, text: '--', unit, updatedAt: null, source: null, warn: false };
  }

  const text = spec.kind === 'state' ? stripUnit(match.displayValue, unit) : formatNumber(match.value, spec.digits);
  return {
    spec,
    value: match.value,
    text,
    unit: spec.kind === 'state' ? '' : unit,
    updatedAt: match.updatedAt,
    source: match.signalName,
    warn: spec.kind === 'state' ? false : isOutOfRange(spec, match.value),
  };
}

function isOutOfRange(spec: SignalSpec, value: number | null): boolean {
  if (value === null) {
    return false;
  }
  if (spec.warnLow !== undefined && value < spec.warnLow) {
    return true;
  }
  if (spec.warnHigh !== undefined && value > spec.warnHigh) {
    return true;
  }
  return false;
}

export function readKpis(system: SystemSpec, index: SignalIndex): SignalReading[] {
  return system.kpis
    .map((id) => findSignalSpec(system.id, id))
    .filter((spec): spec is SignalSpec => spec !== null)
    .map((spec) => readSignal(spec, index));
}

export interface SystemCoverage {
  available: number;
  total: number;
  warnings: number;
}

/** How many catalog values of a system currently have data. */
export function systemCoverage(system: SystemSpec, index: SignalIndex): SystemCoverage {
  let available = 0;
  let total = 0;
  let warnings = 0;
  for (const subsystem of system.subsystems) {
    for (const spec of subsystem.signals) {
      total += 1;
      const reading = readSignal(spec, index);
      if (reading.value !== null) {
        available += 1;
      }
      if (reading.warn) {
        warnings += 1;
      }
    }
  }
  return { available, total, warnings };
}

/** Threshold breaches across every system, derived from the catalog limits. */
export function computeAlerts(index: SignalIndex): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  const seen = new Set<string>();
  for (const system of SYSTEMS) {
    for (const subsystem of system.subsystems) {
      for (const spec of subsystem.signals) {
        if (spec.warnLow === undefined && spec.warnHigh === undefined) {
          continue;
        }
        const reading = readSignal(spec, index);
        const dedupeKey = reading.source ?? `${system.id}.${spec.id}`;
        if (!reading.warn || reading.value === null || seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        alerts.push({
          key: `${system.id}.${spec.id}`,
          systemId: system.id,
          label: spec.label,
          text: reading.text,
          unit: reading.unit,
          kind: spec.warnLow !== undefined && reading.value < spec.warnLow ? 'low' : 'high',
        });
      }
    }
  }
  return alerts;
}
