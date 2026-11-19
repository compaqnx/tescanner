export interface CanFrame {
  id: number;
  data: Uint8Array;
  timestamp: number;
  rawLine: string;
}

export interface DecodedSignal {
  key: string;
  signalName: string;
  messageName: string;
  messageId: number;
  value: number;
  displayValue: string;
  unit: string;
  min: number;
  max: number;
  raw: number;
}

export interface TelemetrySnapshot {
  frameCount: number;
  signalCount: number;
  updatedAt: number;
}
