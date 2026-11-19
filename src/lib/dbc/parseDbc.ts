import { DbcDatabase, DbcMessage, DbcSignal } from './types';

interface PendingSignalComment {
  messageId: number;
  signalName: string;
  comment: string;
}

interface PendingValueTable {
  messageId: number;
  signalName: string;
  values: Record<number, string>;
}

const MESSAGE_LINE = /^BO_\s+(\d+)\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\s+([A-Za-z0-9_]+)/;

const SIGNAL_LINE =
  /^SG_\s+([A-Za-z0-9_]+)\s*(M|m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s+\(([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?),([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\)\s+\[([+-]?\d*\.?\d*)\|([+-]?\d*\.?\d*)\]\s+"([^"]*)"\s*(.*)$/;

const SIGNAL_COMMENT_LINE = /^CM_\s+SG_\s+(\d+)\s+([A-Za-z0-9_]+)\s+"([^"]*)";/;
const VALUE_LINE = /^VAL_\s+(\d+)\s+([A-Za-z0-9_]+)\s+(.+)\s*;/;

function parseNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseReceivers(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(',')
    .map((receiver) => receiver.trim())
    .filter(Boolean);
}

function parseValuePairs(valueString: string): Record<number, string> {
  const values: Record<number, string> = {};
  const pairRegex = /([+-]?\d+)\s+"([^"]*)"/g;
  let match = pairRegex.exec(valueString);

  while (match) {
    const numeric = Number(match[1]);
    if (Number.isFinite(numeric)) {
      values[numeric] = match[2];
    }
    match = pairRegex.exec(valueString);
  }

  return values;
}

export function parseDbc(source: string): DbcDatabase {
  const messages: Record<number, DbcMessage> = {};
  const signalsByName: Record<string, Array<{ messageId: number; signal: DbcSignal }>> = {};

  const pendingComments: PendingSignalComment[] = [];
  const pendingValueTables: PendingValueTable[] = [];

  const lines = source.split(/\r?\n/);
  let currentMessage: DbcMessage | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const messageMatch = line.match(MESSAGE_LINE);
    if (messageMatch) {
      const id = Number(messageMatch[1]);
      const message: DbcMessage = {
        id,
        name: messageMatch[2],
        dlc: Number(messageMatch[3]),
        transmitter: messageMatch[4],
        signals: {},
      };

      messages[id] = message;
      currentMessage = message;
      continue;
    }

    const signalMatch = line.match(SIGNAL_LINE);
    if (signalMatch && currentMessage) {
      const signalName = signalMatch[1];
      const signal: DbcSignal = {
        name: signalName,
        multiplex: signalMatch[2] || undefined,
        startBit: Number(signalMatch[3]),
        bitLength: Number(signalMatch[4]),
        byteOrder: Number(signalMatch[5]) as 0 | 1,
        isSigned: signalMatch[6] === '-',
        factor: parseNumber(signalMatch[7], 1),
        offset: parseNumber(signalMatch[8], 0),
        min: parseNumber(signalMatch[9], Number.NEGATIVE_INFINITY),
        max: parseNumber(signalMatch[10], Number.POSITIVE_INFINITY),
        unit: signalMatch[11] ?? '',
        receivers: parseReceivers(signalMatch[12] ?? ''),
      };

      currentMessage.signals[signalName] = signal;
      const byNameBucket = signalsByName[signalName] || [];
      byNameBucket.push({ messageId: currentMessage.id, signal });
      signalsByName[signalName] = byNameBucket;
      continue;
    }

    const commentMatch = line.match(SIGNAL_COMMENT_LINE);
    if (commentMatch) {
      pendingComments.push({
        messageId: Number(commentMatch[1]),
        signalName: commentMatch[2],
        comment: commentMatch[3],
      });
      continue;
    }

    const valueMatch = line.match(VALUE_LINE);
    if (valueMatch) {
      pendingValueTables.push({
        messageId: Number(valueMatch[1]),
        signalName: valueMatch[2],
        values: parseValuePairs(valueMatch[3]),
      });
      continue;
    }
  }

  for (const pending of pendingComments) {
    const message = messages[pending.messageId];
    if (!message) {
      continue;
    }

    const signal = message.signals[pending.signalName];
    if (signal) {
      signal.comment = pending.comment;
    }
  }

  for (const pending of pendingValueTables) {
    const message = messages[pending.messageId];
    if (!message) {
      continue;
    }

    const signal = message.signals[pending.signalName];
    if (signal) {
      signal.valueDescriptions = pending.values;
    }
  }

  return {
    messages,
    signalsByName,
  };
}
