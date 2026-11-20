import { VLinkerBleClient } from '../ble/VLinkerBleClient';
import { parseCanFrameFromLine } from './frameParser';
import { PollTarget } from './pollPlan';
import { CanFrame } from './types';

interface PendingCommand {
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  lines: string[];
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 2_000;
// Gap after stopping ATMA so the adapter's STOPPED/prompt flush before the next
// filter command, and a short backoff when a write fails mid-cycle.
const POLL_GAP_MS = 40;
const POLL_BACKOFF_MS = 60;

function idToReceiveAddress(id: number): string {
  const hex = id.toString(16).toUpperCase();
  return hex.length < 3 ? hex.padStart(3, '0') : hex;
}

export class Elm327Session {
  private pendingCommand: PendingCommand | null = null;
  private monitorActive = false;
  private pollActive = false;
  private pollGeneration = 0;
  private sleepCancel: (() => void) | null = null;
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

  /**
   * Monitors only the requested CAN ids by cycling a receive-address filter
   * (ATCRA) and sampling each id for its dwell window, instead of monitoring the
   * whole bus. This keeps the adapter from being flooded on a live Tesla bus.
   * Falls back to unfiltered monitoring when there is nothing to target.
   */
  async startFilteredMonitoring(targets: PollTarget[], listener: (frame: CanFrame) => void): Promise<void> {
    if (targets.length === 0) {
      await this.startMonitoring(listener);
      return;
    }

    this.pollGeneration += 1;
    const generation = this.pollGeneration;
    this.frameListener = listener;
    this.pollActive = true;
    void this.runPollLoop(targets, generation);
  }

  private async runPollLoop(targets: PollTarget[], generation: number): Promise<void> {
    let index = 0;

    const live = () => this.pollActive && this.pollGeneration === generation;

    while (live()) {
      const target = targets[index];
      index = (index + 1) % targets.length;

      // The monitor must be stopped to send a command, which the loop guarantees
      // (it is off on entry and after each dwell below).
      try {
        await this.sendCommand(`ATCRA ${idToReceiveAddress(target.id)}`);
      } catch {
        if (!live()) {
          break;
        }
        await this.sleep(POLL_BACKOFF_MS);
        continue;
      }

      if (!live()) {
        break;
      }

      this.monitorActive = true;
      try {
        await this.bleClient.write('ATMA\r');
      } catch {
        this.monitorActive = false;
        if (!live()) {
          break;
        }
        await this.sleep(POLL_BACKOFF_MS);
        continue;
      }

      await this.sleep(target.dwellMs);

      this.monitorActive = false;
      try {
        await this.bleClient.write(' \r');
      } catch {
        // The next command resets adapter state regardless.
      }

      await this.sleep(POLL_GAP_MS);
    }

    if (this.pollGeneration === generation) {
      this.frameListener = undefined;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.sleepCancel = null;
        resolve();
      }, ms);

      this.sleepCancel = () => {
        clearTimeout(timer);
        this.sleepCancel = null;
        resolve();
      };
    });
  }

  async stopMonitoring(): Promise<void> {
    const wasActive = this.monitorActive || this.pollActive;

    this.pollActive = false;
    this.pollGeneration += 1;
    this.monitorActive = false;
    this.frameListener = undefined;
    this.sleepCancel?.();

    if (wasActive) {
      try {
        await this.bleClient.write(' \r');
      } catch {
        // Ignore; the adapter may already be idle.
      }
    }
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
