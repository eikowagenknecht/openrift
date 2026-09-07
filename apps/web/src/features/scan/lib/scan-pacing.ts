import { IDLE_AFTER_NO_WINNER_FRAMES } from "@openrift/shared/scan/session";

import type { ScannerMode } from "@/features/scan/lib/scan-session";

export const IDLE_PACE_DELAY_MS = 300;
export const PAUSED_POLL_MS = 250;
export const IDLE_PACE_MIN_FRAME_MS = 400;
export const SETTLE_TRUST_MS = 500;
export const PUBLISH_THROTTLE_MS = 150;
export const FPS_WINDOW_MS = 1000;

export interface IdlePace {
  streak: number;
  lastTotalMs: number;
}

export function idlePaceStart(): IdlePace {
  return { streak: 0, lastTotalMs: 0 };
}

/**
 * Same reset rule as the session's idle backoff, so pacing lifts on the same
 * frame the full search returns.
 */
export function nextIdlePace(pace: IdlePace, plausible: boolean, totalMs: number): IdlePace {
  return { streak: plausible ? 0 : pace.streak + 1, lastTotalMs: totalMs };
}

export function shouldPaceFrame(pace: IdlePace, mode: ScannerMode): boolean {
  return (
    mode !== "pan" &&
    pace.streak >= IDLE_AFTER_NO_WINNER_FRAMES &&
    pace.lastTotalMs > IDLE_PACE_MIN_FRAME_MS
  );
}

/**
 * Mid-swap frames are blurred or half-occluded; the placement watcher's
 * verdict gates them out. Capture mode is exempt: a tap always runs.
 */
export function settleBlocksFrame(
  settling: { disturbed: boolean; at: number },
  now: number,
  capturing: boolean,
): boolean {
  return settling.disturbed && now - settling.at < SETTLE_TRUST_MS && !capturing;
}

/**
 * The numbers are unreadable faster than this anyway. A lock publishes
 * immediately so it never feels delayed.
 */
export function publishDue(lastPublishAt: number, now: number, force: boolean): boolean {
  return force || now - lastPublishAt >= PUBLISH_THROTTLE_MS;
}

export interface FpsWindow {
  sample: (now: number) => number;
  clear: () => void;
}

export function createFpsWindow(windowMs = FPS_WINDOW_MS): FpsWindow {
  let times: number[] = [];

  return {
    sample(now) {
      times.push(now);
      let oldest = times[0];
      while (oldest !== undefined && now - oldest > windowMs) {
        times.shift();
        oldest = times[0];
      }
      return times.length;
    },
    clear() {
      times = [];
    },
  };
}
