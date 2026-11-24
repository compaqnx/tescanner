import type { CanFrame } from '../can/types';
import type { VehicleProfileId } from '../config/vehicleProfiles';
import type { DbcDatabase } from '../dbc/types';
import type { TeslaModelKey } from './modelDetection';

/**
 * Passive vehicle identification from a short listen-only capture (ATMA) right
 * after connecting. Nothing is sent to the car.
 *
 * - Family (Model 3/Y vs legacy Model S/X): which profile's DBC uniquely knows the
 *   ids seen on the bus.
 * - Exact model: the VIN's 4th character (3 / Y / S / X), when the bus carries it.
 *   Model 3/Y broadcast it on 0x405 (mux 16/17/18). Legacy S/X is decoded best
 *   effort from 0x508 and accepted only if it forms a valid Tesla VIN.
 */

export interface VehicleFingerprint {
  family: VehicleProfileId | null;
  model: TeslaModelKey | null;
  vin: string | null;
  /** Distinct CAN ids seen during the capture. */
  seenIds: Set<number>;
  /** How many seen ids pointed at each family (for the log). */
  scores: Record<VehicleProfileId, number>;
}

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
// Tesla world manufacturer identifiers (US, Berlin, Shanghai, older Model S).
const TESLA_WMI = ['5YJ', '7SA', 'LRW', 'XP7', 'SFZ', '7G2'];

const MODEL_BY_VIN_CHAR: Record<string, TeslaModelKey> = {
  '3': 'model3',
  Y: 'modely',
  S: 'models',
  X: 'modelx',
};

function asciiChunk(data: Uint8Array, from: number): string {
  let text = '';
  for (let i = from; i < data.length; i += 1) {
    const byte = data[i];
    if (byte >= 0x30 && byte <= 0x5a) {
      text += String.fromCharCode(byte);
    }
  }
  return text;
}

function validVin(vin: string): string | null {
  return VIN_PATTERN.test(vin) && TESLA_WMI.some((wmi) => vin.startsWith(wmi)) ? vin : null;
}

export class VehicleFingerprintCollector {
  private readonly seen = new Set<number>();
  private readonly vin405 = new Map<number, string>();
  private readonly vin508 = new Map<number, string>();

  add(frame: CanFrame): void {
    this.seen.add(frame.id);
    const { data } = frame;

    if (frame.id === 0x405 && data.length === 8) {
      const mux = data[0];
      if (mux === 16 || mux === 17 || mux === 18) {
        this.vin405.set(mux, asciiChunk(data, 1));
      }
    } else if (frame.id === 0x508 && data.length === 8 && data[0] <= 2) {
      this.vin508.set(data[0], asciiChunk(data, 1));
    }
  }

  get distinctIds(): number {
    return this.seen.size;
  }

  private assembleVin(): string | null {
    if (this.vin405.size === 3) {
      // mux 16 = four zeros then the WMI (keep its last 3 characters, whether the
      // padding is NUL or ASCII '0'), 18 = characters 4-10, 17 = characters 11-17.
      const wmi = (this.vin405.get(16) ?? '').slice(-3);
      const vin = validVin(`${wmi}${this.vin405.get(18)}${this.vin405.get(17)}`);
      if (vin) {
        return vin;
      }
    }
    if (this.vin508.size === 3) {
      const vin = validVin(`${this.vin508.get(0)}${this.vin508.get(1)}${this.vin508.get(2)}`.slice(0, 17));
      if (vin) {
        return vin;
      }
    }
    return null;
  }

  /**
   * @param familyDbcs DBC per profile, used to find ids only one family defines.
   */
  result(familyDbcs: Record<VehicleProfileId, DbcDatabase>): VehicleFingerprint {
    const families = Object.keys(familyDbcs) as VehicleProfileId[];
    const scores = {} as Record<VehicleProfileId, number>;

    for (const family of families) {
      const own = familyDbcs[family].messages;
      let score = 0;
      for (const id of this.seen) {
        if (!own[id]) {
          continue;
        }
        const sharedWithOther = families.some((other) => other !== family && familyDbcs[other].messages[id]);
        if (!sharedWithOther) {
          score += 1;
        }
      }
      scores[family] = score;
    }

    const vin = this.assembleVin();
    const vinModel = vin ? (MODEL_BY_VIN_CHAR[vin[3]] ?? null) : null;

    let family: VehicleProfileId | null = null;
    if (vinModel) {
      family = vinModel === 'models' || vinModel === 'modelx' ? 'modelsx' : 'model3y';
    } else {
      // Require a clear majority of family-specific ids before switching.
      const ranked = [...families].sort((a, b) => scores[b] - scores[a]);
      const best = ranked[0];
      const runnerUp = ranked[1];
      if (best && scores[best] >= 3 && scores[best] >= 2 * (runnerUp ? scores[runnerUp] : 0)) {
        family = best;
      }
    }

    return { family, model: vinModel, vin, seenIds: new Set(this.seen), scores };
  }
}
