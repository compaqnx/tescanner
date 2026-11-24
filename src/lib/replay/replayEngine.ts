import type { CanFrame } from '../can/types';
import type { SessionStore, SessionSummary, StoredFrame } from '../export/sessionStore';

/**
 * Plays a recorded session back through the live pipeline.
 *
 * The raw CAN frames are re-emitted at their original pace (scaled by the
 * speed) and decoded again with the current DBCs — so decoding fixes apply to
 * old recordings too. Frames are stamped with the wall clock when emitted, so
 * every screen (staleness, rates, the raw view) behaves exactly as when live.
 *
 * Long silent gaps (car asleep, Bluetooth pauses) are shortened to 1 s so a
 * replay never sits idle; the position still shows recording time.
 */

export type ReplayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface ReplayState {
  sessionId: string | null;
  status: ReplayStatus;
  /** Position in the recording, ms from its first frame. */
  positionMs: number;
  durationMs: number;
  speed: number;
  framesPlayed: number;
  totalFrames: number;
  /** Frames skipped because their stored payload was not valid hex. */
  skippedFrames: number;
  error: string | null;
}

export const IDLE_REPLAY: ReplayState = {
  sessionId: null,
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  speed: 1,
  framesPlayed: 0,
  totalFrames: 0,
  skippedFrames: 0,
  error: null,
};

export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;

const PAGE_SIZE = 1_500;
const GAP_LIMIT_MS = 5_000;
const COMPRESSED_GAP_MS = 1_000;
const WAIT_SLICE_MS = 100;
const STATE_INTERVAL_MS = 250;

function toFrame(stored: StoredFrame, timestamp: number): CanFrame | null {
  const hex = stored.payloadHex ?? '';
  if (hex.length === 0 || hex.length % 2 !== 0 || hex.length > 128 || !/^[0-9A-Fa-f]+$/.test(hex)) {
    return null;
  }
  const data = new Uint8Array(hex.length / 2);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return { id: stored.canId, data, timestamp, rawLine: stored.rawLine };
}

export class ReplayEngine {
  private state: ReplayState = IDLE_REPLAY;
  private generation = 0;
  private startTs = 0;
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private seekTargetMs: number | null = null;
  private reanchor = false;
  private lastStateEmit = 0;

  constructor(
    private readonly store: SessionStore,
    private readonly onFrame: (frame: CanFrame) => void,
    private readonly onState: (state: ReplayState) => void,
  ) {}

  get current(): ReplayState {
    return this.state;
  }

  get active(): boolean {
    return this.state.status === 'loading' || this.state.status === 'playing' || this.state.status === 'paused' || this.state.status === 'ended';
  }

  private emit(patch: Partial<ReplayState>, force = false): void {
    this.state = { ...this.state, ...patch };
    const now = Date.now();
    if (force || now - this.lastStateEmit >= STATE_INTERVAL_MS) {
      this.lastStateEmit = now;
      this.onState(this.state);
    }
  }

  start(session: SessionSummary, speed = 1, fromMs = 0): void {
    this.generation += 1;
    this.paused = false;
    this.wakeResumeWaiters();
    this.seekTargetMs = null;
    this.startTs = session.startedAt;
    this.emit(
      {
        ...IDLE_REPLAY,
        sessionId: session.sessionId,
        status: 'playing',
        durationMs: Math.max(0, session.endedAt - session.startedAt),
        totalFrames: session.frameCount,
        positionMs: fromMs,
        speed,
      },
      true,
    );
    void this.run(this.generation, session.sessionId, fromMs);
  }

  pause(): void {
    if (this.state.status !== 'playing') {
      return;
    }
    this.paused = true;
    this.emit({ status: 'paused' }, true);
  }

  resume(): void {
    if (this.state.status !== 'paused') {
      return;
    }
    this.paused = false;
    this.reanchor = true;
    this.emit({ status: 'playing' }, true);
    this.wakeResumeWaiters();
  }

  setSpeed(speed: number): void {
    this.reanchor = true;
    this.emit({ speed }, true);
  }

  /** Jumps to a position (ms from the start), clamped to the recording. */
  seekTo(positionMs: number): void {
    if (!this.state.sessionId) {
      return;
    }
    const target = Math.max(0, Math.min(this.state.durationMs, positionMs));
    if (this.state.status === 'ended') {
      // The loop has finished: start a fresh one from the target.
      const { sessionId, durationMs, totalFrames, speed } = this.state;
      this.start({ sessionId, startedAt: this.startTs, endedAt: this.startTs + durationMs, frameCount: totalFrames, signalCount: 0 }, speed, target);
      return;
    }
    this.seekTargetMs = target;
    this.emit({ positionMs: target }, true);
    this.wakeResumeWaiters();
  }

  seekBy(deltaMs: number): void {
    this.seekTo(this.state.positionMs + deltaMs);
  }

  stop(): void {
    this.generation += 1;
    this.paused = false;
    this.wakeResumeWaiters();
    this.seekTargetMs = null;
    this.emit({ ...IDLE_REPLAY }, true);
  }

  private wakeResumeWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    waiters.forEach((wake) => wake());
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  /** Waits until `wallTime`; returns false when interrupted (stop, seek, pause, speed change). */
  private async waitUntil(wallTime: number, generation: number): Promise<boolean> {
    while (Date.now() < wallTime) {
      if (generation !== this.generation || this.seekTargetMs !== null || this.paused || this.reanchor) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(WAIT_SLICE_MS, wallTime - Date.now())));
    }
    return true;
  }

  private async run(generation: number, sessionId: string, fromMs: number): Promise<void> {
    const live = () => generation === this.generation;
    let fromTs = this.startTs + fromMs;
    let afterRowId = -1;
    let framesPlayed = 0;
    let skipped = 0;

    // Playback runs on a "virtual" timeline: recording time with long gaps
    // shortened. `anchorWall` is the wall time at which `anchorVirtual` plays;
    // pause, speed changes and seeks simply re-anchor.
    let lastPos = fromMs;
    let lastVirtual = 0;
    let anchorWall = Date.now();
    let anchorVirtual = 0;
    const reanchorNow = () => {
      anchorWall = Date.now();
      anchorVirtual = lastVirtual;
      this.reanchor = false;
    };

    try {
      while (live()) {
        const page = await this.store.getFramePage(sessionId, fromTs, afterRowId, PAGE_SIZE);
        if (!live()) {
          return;
        }
        if (page.length === 0) {
          break;
        }

        let restartFrom: number | null = null;

        for (const row of page) {
          const pos = row.timestamp - this.startTs;
          const step = pos - lastPos;
          const virtual = lastVirtual + (step > GAP_LIMIT_MS ? COMPRESSED_GAP_MS : Math.max(0, step));

          // Wait for this frame's moment, handling stop / pause / seek / speed on the way.
          for (;;) {
            if (!live()) {
              return;
            }
            // Seek first, so seeking while paused moves the position right away.
            if (this.seekTargetMs !== null) {
              restartFrom = this.seekTargetMs;
              this.seekTargetMs = null;
              break;
            }
            if (this.paused) {
              await this.waitForResume();
              continue;
            }
            if (this.reanchor) {
              reanchorNow();
            }
            const due = anchorWall + (virtual - anchorVirtual) / this.state.speed;
            if (due <= Date.now() + 10 || (await this.waitUntil(due, generation))) {
              break;
            }
          }
          if (restartFrom !== null) {
            break;
          }

          lastPos = pos;
          lastVirtual = virtual;
          fromTs = row.timestamp;
          afterRowId = row.rowId;

          const frame = toFrame(row, Date.now());
          if (frame) {
            framesPlayed += 1;
            this.onFrame(frame);
          } else {
            skipped += 1;
          }
          this.emit({ positionMs: pos, framesPlayed, skippedFrames: skipped });
        }

        if (restartFrom !== null) {
          fromTs = this.startTs + restartFrom;
          afterRowId = -1;
          lastPos = restartFrom;
          reanchorNow();
          this.emit({ positionMs: restartFrom }, true);
          continue;
        }

        if (page.length < PAGE_SIZE) {
          break;
        }
      }

      if (live()) {
        this.emit({ status: 'ended', positionMs: this.state.durationMs, framesPlayed, skippedFrames: skipped }, true);
      }
    } catch (error) {
      if (live()) {
        this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) }, true);
      }
    }
  }
}
