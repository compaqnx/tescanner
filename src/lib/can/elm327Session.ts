import { VLinkerBleClient } from '../ble/VLinkerBleClient';
import { parseCanFrameFromLine } from './frameParser';
import { CanFrame } from './types';

interface PendingCommand {
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  lines: string[];
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 2_000;

export class Elm327Session {
  private pendingCommand: PendingCommand | null = null;
  private monitorActive = false;
  private frameListener?: (frame: CanFrame) => void;

  constructor(private readonly bleClient: VLinkerBleClient) {
    this.bleClient.setLineListener((line) => {
      this.handleIncomingLine(line);
    });
  }

  async initializeAdapter(): Promise<void> {
    await this.sendCommand('ATZ', 4_000);
    await this.sendCommand('ATE0');
    await this.sendCommand('ATL0');
    await this.sendCommand('ATS0');
    await this.sendCommand('ATH1');
    await this.sendCommand('ATSP6');
    await this.sendCommand('ATCAF0');
    await this.sendCommand('ATCFC0');
  }

  async sendCommand(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
    // Writing anything to the adapter while ATMA is running silently stops the
    // live stream, so refuse commands until monitoring is stopped.
    if (this.monitorActive) {
      throw new Error('Stop the live stream before sending commands.');
    }

    if (this.pendingCommand) {
      throw new Error('A command is already in progress.');
    }

    const normalized = command.trim();
    if (!normalized) {
      throw new Error('Command cannot be empty.');
    }

    return new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pendingCommand) {
          return;
        }

        this.pendingCommand = null;
        reject(new Error(`Command timed out: ${normalized}`));
      }, timeoutMs);

      this.pendingCommand = {
        resolve,
        reject,
        lines: [],
        timeout,
      };

      this.bleClient
        .write(`${normalized}\r`)
        .catch((error: unknown) => {
          if (!this.pendingCommand) {
            return;
          }

          clearTimeout(this.pendingCommand.timeout);
          this.pendingCommand = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  async startMonitoring(listener: (frame: CanFrame) => void): Promise<void> {
    this.monitorActive = true;
    this.frameListener = listener;

    await this.bleClient.write('ATMA\r');
  }

  async stopMonitoring(): Promise<void> {
    if (!this.monitorActive) {
      return;
    }

    this.monitorActive = false;
    this.frameListener = undefined;

    await this.bleClient.write(' \r');
  }

  private handleIncomingLine(rawLine: string): void {
    const line = rawLine.trim();

    if (line === '>') {
      if (this.pendingCommand) {
        const { resolve, lines, timeout } = this.pendingCommand;
        clearTimeout(timeout);
        this.pendingCommand = null;
        resolve(lines);
      }
      return;
    }

    if (this.pendingCommand) {
      this.pendingCommand.lines.push(line);
      return;
    }

    if (!this.monitorActive) {
      return;
    }

    const frame = parseCanFrameFromLine(line);
    if (frame) {
      this.frameListener?.(frame);
    }
  }

  async dispose(): Promise<void> {
    await this.stopMonitoring();
    this.bleClient.setLineListener(undefined);

    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timeout);
      this.pendingCommand.reject(new Error('Session disposed before command completed.'));
      this.pendingCommand = null;
    }
  }
}
