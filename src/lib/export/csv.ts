import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SessionStore } from './sessionStore';

function csvEscape(value: string | number): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function toHexId(canId: number): string {
  return `0x${canId.toString(16).toUpperCase()}`;
}

export async function exportSessionAsCsv(store: SessionStore, sessionId: string): Promise<string | null> {
  const [frames, signals] = await Promise.all([
    store.getFramesForSession(sessionId),
    store.getSignalsForSession(sessionId),
  ]);

  if (frames.length === 0 && signals.length === 0) {
    return null;
  }

  const exportDirectory = new Directory(Paths.document, 'exports');
  exportDirectory.create({ idempotent: true, intermediates: true });

  const filename = `tescanner-${sessionId}.csv`;
  const file = new File(exportDirectory, filename);
  file.create({ overwrite: true, intermediates: true });

  // Stream rows to disk in batches so a long session does not build one giant
  // string in memory before writing.
  const CHUNK_ROWS = 1_000;
  let buffer: string[] = [];
  let wroteAnything = false;

  const flushBuffer = async () => {
    if (buffer.length === 0) {
      return;
    }
    const text = (wroteAnything ? '\n' : '') + buffer.join('\n');
    await file.write(text, { append: true });
    buffer = [];
    wroteAnything = true;
  };

  const writeRow = async (row: string) => {
    buffer.push(row);
    if (buffer.length >= CHUNK_ROWS) {
      await flushBuffer();
    }
  };

  await writeRow('SECTION,FRAME_LOG');
  await writeRow('session_id,timestamp_iso,timestamp_ms,can_id_hex,payload_hex,raw_line');
  for (const frame of frames) {
    await writeRow(
      [
        frame.sessionId,
        iso(frame.timestamp),
        frame.timestamp,
        toHexId(frame.canId),
        frame.payloadHex,
        frame.rawLine,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  await writeRow('');
  await writeRow('SECTION,SIGNAL_LOG');
  await writeRow(
    'session_id,timestamp_iso,timestamp_ms,message_name,message_id_hex,signal_key,signal_name,value,unit,display_value,raw_value',
  );
  for (const signal of signals) {
    await writeRow(
      [
        signal.sessionId,
        iso(signal.timestamp),
        signal.timestamp,
        signal.messageName,
        toHexId(signal.messageId),
        signal.signalKey,
        signal.signalName,
        signal.value,
        signal.unit,
        signal.displayValue,
        signal.raw,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  await flushBuffer();

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Share ${filename}`,
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  }

  return file.uri;
}
