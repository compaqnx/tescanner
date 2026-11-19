import * as SQLite from 'expo-sqlite';
import { CanFrame, DecodedSignal } from '../can/types';

interface SessionSummaryRow {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  frameCount: number;
  signalCount: number;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  frameCount: number;
  signalCount: number;
}

export interface StoredFrame {
  sessionId: string;
  timestamp: number;
  canId: number;
  rawLine: string;
  payloadHex: string;
}

export interface StoredSignal {
  sessionId: string;
  timestamp: number;
  signalKey: string;
  signalName: string;
  messageName: string;
  messageId: number;
  value: number;
  displayValue: string;
  unit: string;
  raw: number;
}

const DATABASE_NAME = 'tescanner.db';
const SCHEMA_VERSION = 1;

function createSessionId(): string {
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');

  return `${Date.now()}-${rand}`;
}

function toHexPayload(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

export class SessionStore {
  private databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
  private activeSessionId: string | null = null;

  private async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.openDatabase();
    }

    return this.databasePromise;
  }

  private async openDatabase(): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS frame_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        can_id INTEGER NOT NULL,
        raw_line TEXT NOT NULL,
        payload_hex TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS signal_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        signal_key TEXT NOT NULL,
        signal_name TEXT NOT NULL,
        message_name TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        value REAL NOT NULL,
        display_value TEXT NOT NULL,
        unit TEXT NOT NULL,
        raw_value REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_frame_session_ts ON frame_log(session_id, ts);
      CREATE INDEX IF NOT EXISTS idx_signal_session_ts ON signal_log(session_id, ts);
      CREATE INDEX IF NOT EXISTS idx_signal_name ON signal_log(signal_name);
    `);

    await db.runAsync(
      'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
      'schema_version',
      String(SCHEMA_VERSION),
    );

    return db;
  }

  async startSession(): Promise<string> {
    const newSessionId = createSessionId();
    this.activeSessionId = newSessionId;
    return newSessionId;
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  async stopSession(): Promise<void> {
    this.activeSessionId = null;
  }

  async appendFrame(frame: CanFrame): Promise<void> {
    const sessionId = this.activeSessionId;
    if (!sessionId) {
      return;
    }

    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO frame_log (session_id, ts, can_id, raw_line, payload_hex)
       VALUES (?, ?, ?, ?, ?)`,
      sessionId,
      frame.timestamp,
      frame.id,
      frame.rawLine,
      toHexPayload(frame.data),
    );
  }

  async appendSignals(timestamp: number, signals: DecodedSignal[]): Promise<void> {
    const sessionId = this.activeSessionId;
    if (!sessionId || signals.length === 0) {
      return;
    }

    const db = await this.getDb();

    for (const signal of signals) {
      await db.runAsync(
        `INSERT INTO signal_log (
          session_id, ts, signal_key, signal_name, message_name, message_id,
          value, display_value, unit, raw_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sessionId,
        timestamp,
        signal.key,
        signal.signalName,
        signal.messageName,
        signal.messageId,
        signal.value,
        signal.displayValue,
        signal.unit,
        signal.raw,
      );
    }
  }

  async getRecentSessions(limit = 15): Promise<SessionSummary[]> {
    const db = await this.getDb();

    const rows = await db.getAllAsync<SessionSummaryRow>(
      `SELECT
          session_id AS sessionId,
          MIN(ts) AS startedAt,
          MAX(ts) AS endedAt,
          COUNT(*) AS frameCount,
          (
            SELECT COUNT(*)
            FROM signal_log s
            WHERE s.session_id = f.session_id
          ) AS signalCount
        FROM frame_log f
        GROUP BY session_id
        ORDER BY endedAt DESC
        LIMIT ?`,
      limit,
    );

    return rows.map((row) => ({
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      frameCount: row.frameCount,
      signalCount: row.signalCount,
    }));
  }

  async getFramesForSession(sessionId: string): Promise<StoredFrame[]> {
    const db = await this.getDb();

    const rows = await db.getAllAsync<{
      sessionId: string;
      timestamp: number;
      canId: number;
      rawLine: string;
      payloadHex: string;
    }>(
      `SELECT
        session_id AS sessionId,
        ts AS timestamp,
        can_id AS canId,
        raw_line AS rawLine,
        payload_hex AS payloadHex
      FROM frame_log
      WHERE session_id = ?
      ORDER BY ts ASC`,
      sessionId,
    );

    return rows;
  }

  async getSignalsForSession(sessionId: string): Promise<StoredSignal[]> {
    const db = await this.getDb();

    const rows = await db.getAllAsync<{
      sessionId: string;
      timestamp: number;
      signalKey: string;
      signalName: string;
      messageName: string;
      messageId: number;
      value: number;
      displayValue: string;
      unit: string;
      raw: number;
    }>(
      `SELECT
        session_id AS sessionId,
        ts AS timestamp,
        signal_key AS signalKey,
        signal_name AS signalName,
        message_name AS messageName,
        message_id AS messageId,
        value AS value,
        display_value AS displayValue,
        unit AS unit,
        raw_value AS raw
      FROM signal_log
      WHERE session_id = ?
      ORDER BY ts ASC`,
      sessionId,
    );

    return rows;
  }
}
