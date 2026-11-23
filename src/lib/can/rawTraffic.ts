/** One line received while monitoring, as shown in the Raw CAN view. */
export interface RawCanEntry {
  /** Monotonic sequence number (stable list key). */
  seq: number;
  timestamp: number;
  /** The line exactly as the adapter sent it. */
  line: string;
  /** Parsed CAN id, or null when the line is not a frame (e.g. BUFFER FULL, ?). */
  id: number | null;
  /** Payload bytes as "A1 B2 C3 ..." when parsed. */
  dataHex: string | null;
  /** DBC message name for the id, when the loaded DBC knows it. */
  messageName: string | null;
}

/** Per-id summary of the traffic seen during the current stream. */
export interface RawCanIdStat {
  id: number;
  count: number;
  lastDataHex: string;
  lastAt: number;
  /** True when the last payload differed from the one before it. */
  changed: boolean;
  messageName: string | null;
}

export interface RawCanCounters {
  /** Every line received while monitoring. */
  lines: number;
  /** Lines that did not parse as a CAN frame. */
  unparsed: number;
}

export function formatCanId(id: number): string {
  const hex = id.toString(16).toUpperCase();
  return id > 0x7ff ? hex.padStart(8, '0') : hex.padStart(3, '0');
}

export function formatPayload(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}
