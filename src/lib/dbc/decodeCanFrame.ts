import { CanFrame, DecodedSignal } from '../can/types';
import { DbcDatabase, DbcMessage, DbcSignal } from './types';

function toBigIntBuffer(data: Uint8Array): bigint {
  let result = 0n;
  for (const value of data) {
    result = (result << 8n) | BigInt(value);
  }
  return result;
}

function extractLittleEndianRaw(data: Uint8Array, startBit: number, bitLength: number): bigint {
  let value = 0n;

  for (let i = 0; i < bitLength; i += 1) {
    const absoluteBit = startBit + i;
    const byteIndex = Math.floor(absoluteBit / 8);
    const bitInByte = absoluteBit % 8;

    const byteValue = data[byteIndex] ?? 0;
    const bit = (byteValue >> bitInByte) & 0x01;
    value |= BigInt(bit) << BigInt(i);
  }

  return value;
}

function extractBigEndianRaw(data: Uint8Array, startBit: number, bitLength: number): bigint {
  const totalBits = data.length * 8;
  const bigBuffer = toBigIntBuffer(data);

  let value = 0n;
  let currentBit = startBit;

  for (let i = 0; i < bitLength; i += 1) {
    const absoluteMsbIndex = totalBits - 1 - currentBit;
    if (absoluteMsbIndex < 0) {
      break;
    }

    const bit = (bigBuffer >> BigInt(absoluteMsbIndex)) & 1n;
    value = (value << 1n) | bit;

    if ((currentBit & 7) === 0) {
      currentBit += 15;
    } else {
      currentBit -= 1;
    }
  }

  return value;
}

function toSignedValue(raw: bigint, bitLength: number): bigint {
  if (bitLength <= 0) {
    return 0n;
  }

  const signBit = 1n << BigInt(bitLength - 1);
  if ((raw & signBit) === 0n) {
    return raw;
  }

  const fullRange = 1n << BigInt(bitLength);
  return raw - fullRange;
}

function normalizeRangeBound(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function formatValue(value: number, unit: string, enumLabel?: string): string {
  if (enumLabel) {
    return unit ? `${enumLabel} (${unit})` : enumLabel;
  }

  if (!Number.isFinite(value)) {
    return 'NaN';
  }

  const abs = Math.abs(value);
  const precision = abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
  const numeric = value.toFixed(precision);
  return unit ? `${numeric} ${unit}` : numeric;
}

function decodeSignal(signal: DbcSignal, frame: CanFrame): DecodedSignal | null {
  const bitLength = signal.bitLength;
  if (bitLength <= 0 || bitLength > 64) {
    return null;
  }

  const raw =
    signal.byteOrder === 1
      ? extractLittleEndianRaw(frame.data, signal.startBit, bitLength)
      : extractBigEndianRaw(frame.data, signal.startBit, bitLength);

  const normalizedRaw = signal.isSigned ? toSignedValue(raw, bitLength) : raw;
  const rawNumber = Number(normalizedRaw);

  if (!Number.isFinite(rawNumber)) {
    return null;
  }

  const value = rawNumber * signal.factor + signal.offset;
  const enumLabel = signal.valueDescriptions?.[rawNumber];

  return {
    key: signal.name,
    signalName: signal.name,
    messageName: '',
    messageId: frame.id,
    value,
    displayValue: formatValue(value, signal.unit, enumLabel),
    unit: signal.unit,
    min: normalizeRangeBound(signal.min, Number.NEGATIVE_INFINITY),
    max: normalizeRangeBound(signal.max, Number.POSITIVE_INFINITY),
    raw: rawNumber,
  };
}

function multiplexGroup(multiplex: string | undefined): number | null {
  // 'M' is the multiplexor switch and 'undefined' is a plain signal; neither is
  // tied to a specific group. 'm0', 'm12', ... identify multiplexed signals that
  // are only present when the switch equals that number.
  if (!multiplex || multiplex === 'M') {
    return null;
  }

  const match = /^m(\d+)$/.exec(multiplex);
  return match ? Number(match[1]) : null;
}

export function decodeFrameSignals(frame: CanFrame, message: DbcMessage): DecodedSignal[] {
  const signals = Object.values(message.signals);

  // If the message is multiplexed, decode the multiplexor switch first so we know
  // which multiplexed group is actually present in this frame. Decoding every
  // group unconditionally (the previous behavior) emitted garbage for whichever
  // groups were not transmitted.
  let activeGroup: number | null = null;
  const multiplexor = signals.find((signal) => signal.multiplex === 'M');
  if (multiplexor) {
    const switchResult = decodeSignal(multiplexor, frame);
    if (switchResult && Number.isFinite(switchResult.raw)) {
      activeGroup = switchResult.raw;
    }
  }

  const decoded: DecodedSignal[] = [];

  for (const signal of signals) {
    const group = multiplexGroup(signal.multiplex);
    if (group !== null && group !== activeGroup) {
      continue;
    }

    const result = decodeSignal(signal, frame);

    if (!result) {
      continue;
    }

    decoded.push({
      ...result,
      messageName: message.name,
      key: `${message.name}.${result.signalName}`,
    });
  }

  return decoded;
}

export function decodeCanFrame(frame: CanFrame, dbc: DbcDatabase): DecodedSignal[] {
  const message = dbc.messages[frame.id];
  if (!message) {
    return [];
  }

  return decodeFrameSignals(frame, message);
}
