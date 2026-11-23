import { CanFrame } from './types';

const NON_DATA_LINES = new Set([
  '',
  'OK',
  '?',
  'NO DATA',
  'STOPPED',
  'SEARCHING...',
  'BUS INIT: ERROR',
  'UNABLE TO CONNECT',
  'CAN ERROR',
  'ERROR',
  'BUFFER FULL',
  'DATA ERROR',
  '<RX ERROR',
  'FB ERROR',
  'BUS BUSY',
  'BUS ERROR',
  'LV RESET',
  'ACT ALERT',
]);

// Adapter banners / command echoes that must never be mistaken for a frame.
// None of these can start a pure-hex frame line ('T', 'N', 'L' are not hex).
const NON_DATA_PREFIXES = ['ELM327', 'STN', 'VLINKER', 'AT'];

const HEX_ID = /^[0-9A-F]{3,8}$/;
const HEX_BYTE = /^[0-9A-F]{2}$/;
const HEX_NIBBLE = /^[0-9A-F]$/;

function normalizeLine(line: string): string {
  return line.trim().toUpperCase();
}

/**
 * Compact monitor output produced with headers on and spaces off (ATH1 + ATS0),
 * e.g. `3D2A1B2C3D4E5F6071`. The id length follows from the line length: an
 * 11-bit id is 3 hex chars + 2n data chars (odd total), a 29-bit id is 8 hex
 * chars + 2n data chars (even total). With ATD1 a single DLC nibble follows the
 * id; it is accepted only when it matches the remaining byte count.
 */
function parseCompactFormat(line: string): { id: number; bytes: string[] } | null {
  if (!/^[0-9A-F]+$/.test(line)) {
    return null;
  }

  // Try 11-bit first (the Tesla buses are all 11-bit), then 29-bit.
  for (const idLength of [3, 8]) {
    if (line.length <= idLength) {
      continue;
    }

    let payload = line.slice(idLength);
    if (payload.length % 2 === 1) {
      // Possible DLC nibble (ATD1).
      const dlc = Number.parseInt(payload[0], 16);
      if (dlc > 8 || dlc * 2 !== payload.length - 1) {
        continue;
      }
      payload = payload.slice(1);
    }

    if (payload.length === 0 || payload.length > 128) {
      continue;
    }

    return {
      id: Number.parseInt(line.slice(0, idLength), 16),
      bytes: payload.match(/.{2}/g) ?? [],
    };
  }

  return null;
}

function parseHashFormat(line: string): { id: number; bytes: string[] } | null {
  const hashIndex = line.indexOf('#');
  if (hashIndex <= 0) {
    return null;
  }

  const idToken = line.slice(0, hashIndex).trim();
  const payload = line.slice(hashIndex + 1).replace(/\s+/g, '');

  if (!HEX_ID.test(idToken) || payload.length < 2 || payload.length % 2 !== 0) {
    return null;
  }

  const bytes: string[] = [];
  for (let i = 0; i < payload.length; i += 2) {
    const pair = payload.slice(i, i + 2);
    if (!HEX_BYTE.test(pair)) {
      return null;
    }
    bytes.push(pair);
  }

  return {
    id: Number.parseInt(idToken, 16),
    bytes,
  };
}

function parseTokenFormat(line: string): { id: number; bytes: string[] } | null {
  const tokens = line
    .replace(/[\[\]()]/g, ' ')
    .split(/[\s:,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length < 2) {
    return null;
  }

  const idIndex = tokens.findIndex((token) => HEX_ID.test(token));
  if (idIndex < 0) {
    return null;
  }

  const idToken = tokens[idIndex];
  let dataStartIndex = idIndex + 1;

  if (tokens[dataStartIndex] && HEX_NIBBLE.test(tokens[dataStartIndex])) {
    const maybeLength = Number.parseInt(tokens[dataStartIndex], 16);
    const availableBytes = tokens.slice(dataStartIndex + 1).filter((token) => HEX_BYTE.test(token)).length;
    if (availableBytes >= maybeLength && maybeLength <= 64) {
      dataStartIndex += 1;
    }
  }

  const bytes = tokens.slice(dataStartIndex).filter((token) => HEX_BYTE.test(token));
  if (!bytes.length) {
    return null;
  }

  return {
    id: Number.parseInt(idToken, 16),
    bytes,
  };
}

function toByteArray(tokens: string[]): Uint8Array {
  const values = tokens.map((token) => Number.parseInt(token, 16));
  return Uint8Array.from(values);
}

export function parseCanFrameFromLine(rawLine: string, timestamp = Date.now()): CanFrame | null {
  const normalized = normalizeLine(rawLine);

  if (!normalized || NON_DATA_LINES.has(normalized)) {
    return null;
  }

  if (NON_DATA_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }

  const stripped = normalized.replace(/^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s+/, '');

  // The session runs with spaces off (ATS0), so ATMA lines have no separators at
  // all ("3D2A1B2C..."). The token parser sees that as one over-long token and
  // rejected every frame — which is why streaming showed nothing. Parse the
  // compact form whenever the line has no separators.
  const parsed = /[\s#:,]/.test(stripped)
    ? parseHashFormat(stripped) || parseTokenFormat(stripped)
    : parseCompactFormat(stripped);

  if (!parsed) {
    return null;
  }

  return {
    id: parsed.id,
    data: toByteArray(parsed.bytes),
    timestamp,
    rawLine,
  };
}
