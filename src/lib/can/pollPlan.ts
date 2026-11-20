import { buildAliasLookup, VehicleProfileDefinition } from '../config/vehicleProfiles';
import { DbcDatabase } from '../dbc/types';
import { HV_ACCESSORY_PRIORITIES, isHvCellSignal } from '../hv/hvSignalCatalog';

export interface PollTarget {
  /** 11-bit CAN identifier to request from the adapter. */
  id: number;
  /** How long (ms) to monitor this id per visit. */
  dwellMs: number;
}

// A plain message is sampled briefly; a multiplexed message (one id, many mux
// groups such as the per-brick voltages on 0x401) is held longer so a visit can
// capture several groups before moving on.
const BASE_DWELL_MS = 120;
const MUX_DWELL_MS = 350;

const HV_ACCESSORY_SET = new Set(HV_ACCESSORY_PRIORITIES);

/**
 * Works out the set of CAN ids worth requesting for a profile, so the adapter can
 * be told to forward only those frames (via a receive-address filter) instead of
 * the whole bus. Unfiltered monitor-all overwhelms an ELM327/STN Bluetooth link on
 * a live Tesla bus, which is the problem Scan My Tesla solves with hardware filters.
 *
 * Priority ids carry a dashboard/watched signal and are visited first; secondary
 * ids carry HV cell/accessory data. Signals outside these sets are not requested,
 * matching the "choose what to log to stay fast" trade-off.
 */
export function derivePollTargets(dbc: DbcDatabase, profile: VehicleProfileDefinition): PollTarget[] {
  const aliasLookup = buildAliasLookup(profile);

  const priorityIds: number[] = [];
  const secondaryIds: number[] = [];
  const multiplexedIds = new Set<number>();
  const seen = new Set<number>();

  for (const message of Object.values(dbc.messages)) {
    let relevant = false;
    let isPriority = false;
    let hasMultiplexor = false;

    for (const signal of Object.values(message.signals)) {
      if (signal.multiplex === 'M') {
        hasMultiplexor = true;
      }

      if (aliasLookup.has(signal.name) || aliasLookup.has(signal.name.toLowerCase())) {
        relevant = true;
        isPriority = true;
      } else if (isHvCellSignal(signal.name) || HV_ACCESSORY_SET.has(signal.name)) {
        relevant = true;
      }
    }

    if (!relevant || seen.has(message.id)) {
      continue;
    }

    seen.add(message.id);
    if (hasMultiplexor) {
      multiplexedIds.add(message.id);
    }
    if (isPriority) {
      priorityIds.push(message.id);
    } else {
      secondaryIds.push(message.id);
    }
  }

  return [...priorityIds, ...secondaryIds].map((id) => ({
    id,
    dwellMs: multiplexedIds.has(id) ? MUX_DWELL_MS : BASE_DWELL_MS,
  }));
}
