import { VLinkerBleClient } from '../ble/VLinkerBleClient';
import { parseCanFrameFromLine } from './frameParser';
import { PollTarget } from './pollPlan';
import { CanFrame } from './types';

interface PendingCommand {
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  lines: string[];
  timeout: ReturnType<typeof setTimeout>;
  /**
   * True while waiting for the prompt after interrupting ATMA: lines still in
   * flight are frames captured before the stop, so they go to the frame listener
   * instead of being swallowed as command output.
   */
  drainingMonitor: boolean;
}

/** One line seen on the wire while monitoring, parsed or not (for the Raw CAN view). */
export interface RawMonitorLine {
  line: string;
  timestamp: number;
  frame: CanFrame | null;
}

const DEFAULT_TIMEOUT_MS = 2_000;
// How long to wait for STOPPED + '>' after interrupting ATMA. Over Bluetooth the
// prompt can lag well behind the stop, so the next command must not be sent
// before it arrives or the stale '>' completes that command instead.
const STOP_TIMEOUT_MS = 600;
// Short backoff when a write fails mid-cycle.
const POLL_BACKOFF_MS = 60;
// Interrupts ATMA. A single non-CR character: a bare CR on an idle adapter would
// repeat the last command (ATMA), and a trailing CR after the interrupt can do the
// same once the prompt is back. A stray space on an idle adapter is harmless —
// the ELM327 ignores spaces in the next command.
const MONITOR_INTERRUPT = ' ';

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
  private rawLineListener?: (line: RawMonitorLine) => void;

  constructor(private readonly bleClient: VLinkerBleClient) {
    this.bleClient.setLineListener((line) => {
      this.handleIncomingLine(line);
    });
  }

  /** Receives every line seen while monitoring — frames and adapter messages alike. */
  setRawLineListener(listener?: (line: RawMonitorLine) => void): void {
    this.rawLineListener = listener;
  }

  async initializeAdapter(): Promise<void> {
    await this.sendCommand('ATZ', 4_000);
    await this.sendCommand('ATE0');
    await this.sendCommand('ATL0');
    // Spaces off keeps monitor lines ~30% shorter over Bluetooth; the frame
    // parser handles the compact "3D2A1B2C..." form.
    await this.sendCommand('ATS0');
    await this.sendCommand('ATH1');
    await this.sendCommand('ATD0');
    await this.sendCommand('ATSP6');
    await this.sendCommand('ATCAF0');
    await this.sendCommand('ATCFC0');
  }

  async sendCommand(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
    // Writing anything to the adapter while ATMA is running silently stops the
    // live stream, so refuse commands until monitoring is stopped.
    // The filtered poll loop sends its own commands between dwells, so outside
    // commands are refused for the whole stream, not just while ATMA runs.
    if (this.monitorActive || this.pollActive) {
      throw new Error('Stop the live stream before sending commands.');
    }

    return this.command(command, timeoutMs);
  }

  private command(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
    const normalized = command.trim();
    if (!normalized) {
      return Promise.reject(new Error('Command cannot be empty.'));
    }

    return this.writeAndAwaitPrompt(`${normalized}\r`, timeoutMs, false);
  }

  private writeAndAwaitPrompt(payload: string, timeoutMs: number, drainingMonitor: boolean): Promise<string[]> {
    if (this.pendingCommand) {
      return Promise.reject(new Error('A command is already in progress.'));
    }

    const label = payload.trim() || 'monitor stop';

    return new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pendingCommand) {
          return;
        }

        const { lines } = this.pendingCommand;
        this.pendingCommand = null;
        if (drainingMonitor) {
          // The adapter may already have been idle; nothing to wait for.
          resolve(lines);
        } else {
          reject(new Error(`Command timed out: ${label}`));
        }
      }, timeoutMs);

      this.pendingCommand = {
        resolve,
        reject,
        lines: [],
        timeout,
        drainingMonitor,
      };

      this.bleClient.write(payload).catch((error: unknown) => {
        if (!this.pendingCommand) {
          return;
        }

        clearTimeout(this.pendingCommand.timeout);
        this.pendingCommand = null;
        if (drainingMonitor) {
          resolve([]);
        } else {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  /** Interrupts ATMA and waits for the adapter's prompt so the next command is clean. */
  private async interruptMonitor(): Promise<void> {
    this.monitorActive = false;
    await this.writeAndAwaitPrompt(MONITOR_INTERRUPT, STOP_TIMEOUT_MS, true);
  }

  /** Unfiltered monitoring of the whole bus. */
  async startMonitoring(listener: (frame: CanFrame) => void): Promise<void> {
    // A previous filtered stream leaves an ATCRA receive filter in place, which
    // would silently restrict this "monitor all" stream to one id.
    await this.sendCommand('ATAR');

    this.frameListener = listener;
    this.monitorActive = true;
    try {
      await this.bleClient.write('ATMA\r');
    } catch (error) {
      this.monitorActive = false;
      throw error;
    }
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
        await this.command(`ATCRA ${idToReceiveAddress(target.id)}`);
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

      if (!live()) {
        // stopMonitoring() owns the interrupt from here.
        break;
      }

      try {
        await this.interruptMonitor();
      } catch {
        // The next command resets adapter state regardless.
        this.monitorActive = false;
      }
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
    const wasMonitoring = this.monitorActive;

    this.pollActive = false;
    this.pollGeneration += 1;
    this.sleepCancel?.();
    this.frameListener = undefined;

    if (wasMonitoring && !this.pendingCommand) {
      try {
        await this.interruptMonitor();
      } catch {
        // Ignore; the adapter may already be idle.
      }
    } else if (this.pendingCommand) {
      // A poll-loop command (ATCRA or a monitor stop) is in flight; let it finish
      // so the adapter is back at the prompt before anyone sends the next command.
      const pending = this.pendingCommand;
      await new Promise<void>((resolve) => {
        const check = () => {
          if (this.pendingCommand !== pending) {
            resolve();
          } else {
            setTimeout(check, 20);
          }
        };
        check();
      });
    }

    this.monitorActive = false;
  }

  private handleIncomingLine(rawLine: string): void {
    const line = rawLine.trim();

    if (line === '>') {
      if (this.pendingCommand) {
        const { resolve, lines, timeout } = this.pendingCommand;
        clearTimeout(timeout);
        this.pendingCommand = null;
        resolve(lines);
      } else if (this.monitorActive && !this.pollActive) {
        // The adapter ended ATMA on its own (typically BUFFER FULL on a busy
        // bus). In unfiltered mode nothing else would restart it, so resume.
        this.bleClient.write('ATMA\r').catch(() => {
          this.monitorActive = false;
        });
      }
      return;
    }

    const pending = this.pendingCommand;
    if (pending && !pending.drainingMonitor) {
      pending.lines.push(line);
      return;
    }

    if (!this.monitorActive && !pending) {
      return;
    }

    const timestamp = Date.now();
    const frame = parseCanFrameFromLine(line, timestamp);
    if (pending) {
      pending.lines.push(line);
    }

    this.rawLineListener?.({ line, timestamp, frame });

    if (frame) {
      this.frameListener?.(frame);
    }
  }

  async dispose(): Promise<void> {
    await this.stopMonitoring();
    this.rawLineListener = undefined;
    this.bleClient.setLineListener(undefined);

    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timeout);
      this.pendingCommand.reject(new Error('Session disposed before command completed.'));
      this.pendingCommand = null;
    }
  }
}
