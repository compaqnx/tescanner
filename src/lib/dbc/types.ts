export interface DbcSignal {
  name: string;
  startBit: number;
  bitLength: number;
  byteOrder: 0 | 1;
  isSigned: boolean;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receivers: string[];
  multiplex?: string;
  valueDescriptions?: Record<number, string>;
  comment?: string;
}

export interface DbcMessage {
  id: number;
  name: string;
  dlc: number;
  transmitter: string;
  signals: Record<string, DbcSignal>;
}

export interface DbcDatabase {
  messages: Record<number, DbcMessage>;
  signalsByName: Record<string, Array<{ messageId: number; signal: DbcSignal }>>;
}
