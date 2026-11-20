import { buildAliasLookup, VehicleProfileDefinition } from '../config/vehicleProfiles';
import { DbcDatabase } from '../dbc/types';
import { HV_ACCESSORY_PRIORITIES, isHvCellSignal } from '../hv/hvSignalCatalog';
import { buildSystemSignalIndex, SYSTEMS, type SystemId } from '../systems/systemCatalog';

export interface PollTarget {
  /** 11-bit CAN identifier to request from the adapter. */
  id: number;
  /** How long (ms) to monitor this id per visit. */
  dwellMs: number;
}

export interface PollTargetInfo extends PollTarget {
  /** Human label built from the signals the message carries. */
  label: string;
  /** 'core' = a dashboard/watched signal; 'hv' = cell/accessory data; 'system' = feeds an EV system screen. */
  category: 'core' | 'hv' | 'system';
  /** EV systems whose screens use signals from this message (first = primary). */
  systems: SystemId[];
  /** True when the message is multiplexed (one id, several mux groups). */
  multiplexed: boolean;
  /** How many decodable signals of interest the message carries. */
  signalCount: number;
}

// A plain message is sampled briefly; a multiplexed message (one id, many mux
// groups such as the per-brick voltages on 0x401) is held longer so a visit can
// capture several groups before moving on.
const BASE_DWELL_MS = 120;
const MUX_DWELL_MS = 350;
// Per-visit cost beyond the dwell: the filter command plus the stop gap between
// ids. Used only to estimate the full-cycle refresh time shown in the UI.
const PER_TARGET_OVERHEAD_MS = 100;

const HV_ACCESSORY_SET = new Set(HV_ACCESSORY_PRIORITIES);
const SYSTEM_SIGNAL_INDEX = buildSystemSignalIndex();
const SYSTEM_ORDER = new Map<SystemId, number>(SYSTEMS.map((system, index) => [system.id, index]));

function cleanMessageName(name: string): string {
  // DBC names are "ID" + exactly three hex digits + name (e.g. ID3F3UI_odo).
  const stripped = name.replace(/^ID[0-9A-F]{3}/, '').trim();
  return stripped.length > 0 ? stripped : name;
}

/**
 * Builds the catalog of CAN ids worth requesting for a profile, each described
 * so the user can pick which to poll. Requesting only the selected ids (via a
 * receive-address filter) keeps an ELM327/STN Bluetooth link from being flooded
 * by the whole bus — the trade-off Scan My Tesla exposes as "choose what to log".
 *
 * Each id is tagged with the EV systems (battery, drive, charging, ...) that
 * display its signals, so the UI can focus the stream on one system at a time.
 */
export function describePollTargets(dbc: DbcDatabase, profile: VehicleProfileDefinition): PollTargetInfo[] {
  const aliasLookup = buildAliasLookup(profile);

  const targets: PollTargetInfo[] = [];

  for (const message of Object.values(dbc.messages)) {
    const aliasLabels = new Set<string>();
    const systems = new Set<SystemId>();
    let hasHvSignal = false;
    let hasMultiplexor = false;
    let signalCount = 0;

    for (const signal of Object.values(message.signals)) {
      if (signal.multiplex === 'M') {
        hasMultiplexor = true;
      }

      const resolved = aliasLookup.get(signal.name) ?? aliasLookup.get(signal.name.toLowerCase());
      const canonical = resolved?.canonicalName ?? signal.name;
      const isCell = isHvCellSignal(signal.name);
      const systemId =
        SYSTEM_SIGNAL_INDEX.get(canonical) ??
        SYSTEM_SIGNAL_INDEX.get(signal.name) ??
        (isCell || HV_ACCESSORY_SET.has(signal.name) ? 'ess' : undefined);

      if (systemId) {
        systems.add(systemId);
      }

      if (resolved) {
        aliasLabels.add(resolved.label);
        signalCount += 1;
      } else if (isCell || HV_ACCESSORY_SET.has(signal.name)) {
        hasHvSignal = true;
        signalCount += 1;
      } else if (systemId) {
        signalCount += 1;
      }
    }

    if (aliasLabels.size === 0 && !hasHvSignal && systems.size === 0) {
      continue;
    }

    const dwellMs = hasMultiplexor ? MUX_DWELL_MS : BASE_DWELL_MS;
    const systemList = Array.from(systems).sort(
      (a, b) => (SYSTEM_ORDER.get(a) ?? 0) - (SYSTEM_ORDER.get(b) ?? 0),
    );

    let label: string;
    let category: PollTargetInfo['category'];
    if (aliasLabels.size > 0) {
      const labels = Array.from(aliasLabels);
      label = labels.slice(0, 2).join(', ') + (labels.length > 2 ? '…' : '');
      category = 'core';
    } else {
      label = cleanMessageName(message.name);
      category = hasHvSignal ? 'hv' : 'system';
    }

    targets.push({
      id: message.id,
      dwellMs,
      label,
      category,
      systems: systemList,
      multiplexed: hasMultiplexor,
      signalCount,
    });
  }

  const categoryOrder: Record<PollTargetInfo['category'], number> = { core: 0, hv: 1, system: 2 };
  targets.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category] || a.id - b.id);
  return targets;
}

/** True when the message feeds the given system's screen. */
export function pollTargetServes(info: PollTargetInfo, systemId: SystemId): boolean {
  return info.systems.includes(systemId);
}

export function toPollTargets(infos: PollTargetInfo[]): PollTarget[] {
  return infos.map((info) => ({ id: info.id, dwellMs: info.dwellMs }));
}

/** Estimated time for one full pass over the given targets, in milliseconds. */
export function estimateCycleMs(infos: Array<Pick<PollTargetInfo, 'dwellMs'>>): number {
  return infos.reduce((sum, info) => sum + info.dwellMs + PER_TARGET_OVERHEAD_MS, 0);
}

/** Convenience: every pollable target for a profile, as adapter targets. */
export function derivePollTargets(dbc: DbcDatabase, profile: VehicleProfileDefinition): PollTarget[] {
  return toPollTargets(describePollTargets(dbc, profile));
}
