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

  const lines: string[] = [];

  lines.push('SECTION,FRAME_LOG');
  lines.push('session_id,timestamp_iso,timestamp_ms,can_id_hex,payload_hex,raw_line');
  for (const frame of frames) {
    lines.push(
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

  lines.push('');
  lines.push('SECTION,SIGNAL_LOG');
  lines.push(
    'session_id,timestamp_iso,timestamp_ms,message_name,message_id_hex,signal_key,signal_name,value,unit,display_value,raw_value',
  );

  for (const signal of signals) {
    lines.push(
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

  const exportDirectory = new Directory(Paths.document, 'exports');
  exportDirectory.create({ idempotent: true, intermediates: true });

  const filename = `tescanner-${sessionId}.csv`;
  const file = new File(exportDirectory, filename);
  file.create({ overwrite: true, intermediates: true });
  await file.write(lines.join('\n'));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Share ${filename}`,
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  }

  return file.uri;
}
