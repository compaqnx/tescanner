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
]);

const HEX_ID = /^[0-9A-F]{3,8}$/;
const HEX_BYTE = /^[0-9A-F]{2}$/;
const HEX_NIBBLE = /^[0-9A-F]$/;

function normalizeLine(line: string): string {
  return line.trim().toUpperCase();
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

  const stripped = normalized.replace(/^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\s+/, '');

  const hashFormat = parseHashFormat(stripped);
  const parsed = hashFormat || parseTokenFormat(stripped);

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
