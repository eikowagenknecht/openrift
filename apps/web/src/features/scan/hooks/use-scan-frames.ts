import type { FrameOutcome } from "@openrift/shared/scan/session";
import { centeredGuideQuad } from "@openrift/shared/scan/session";
import type { RgbaImage } from "@openrift/shared/scan/types";
import type { RefObject } from "react";
import { useRef, useState } from "react";

import {
  areaFractionOfGuide,
  createAimHintSmoother,
  deriveAimHint,
} from "@/features/scan/lib/scan-aim-hint";
import type { AimStreaks } from "@/features/scan/lib/scan-aim-streak";
import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import { frameLogLine, printingLogLine } from "@/features/scan/lib/scan-frame-log";
import type { LockedCard, ScannerEvents } from "@/features/scan/lib/scan-locks";
import { appendLock, lockFromTrack, resolvePrintingIn } from "@/features/scan/lib/scan-locks";
import {
  IDLE_PACE_DELAY_MS,
  PAUSED_POLL_MS,
  createFpsWindow,
  idlePaceStart,
  nextIdlePace,
  publishDue,
  settleBlocksFrame,
  shouldPaceFrame,
} from "@/features/scan/lib/scan-pacing";
import type { PlacementTally } from "@/features/scan/lib/scan-placement-counts";
import type { ScannerReadout } from "@/features/scan/lib/scan-readout";
import { EMPTY_READOUT, aimHintInputFor, buildReadout } from "@/features/scan/lib/scan-readout";
import type { RelockGuard } from "@/features/scan/lib/scan-relock";
import type { RotationTracker } from "@/features/scan/lib/scan-rotation";
import type { ScannerSettings } from "@/features/scan/lib/scan-session";
import { lockRunForMode } from "@/features/scan/lib/scan-session";
import { errorText } from "@/lib/error-text";
import type { ScanWorkerOutcome, SessionKind } from "@/workers/scan-worker";

import type { ScanOverlayTargetInput } from "./use-scan-overlay";

export interface ScanFramesOptions {
  loaded: LoadedScanBank | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  runningRef: RefObject<boolean>;
  runGenerationRef: RefObject<number>;
  settingsRef: RefObject<ScannerSettings>;
  eventsRef: RefObject<ScannerEvents | undefined>;
  sessionStartRef: RefObject<number>;
  nextFrameIndex: () => number;
  setFrameInFlight: (frame: Promise<unknown>) => void;
  capturingRef: RefObject<boolean>;
  setCapturing: (capturing: boolean) => void;
  relockRef: RefObject<RelockGuard>;
  settlingRef: RefObject<{ disturbed: boolean; at: number }>;
  tallyRef: RefObject<PlacementTally>;
  clearPendingFrame: () => void;
  idleGateRef: RefObject<number>;
  rotationRef: RefObject<RotationTracker>;
  aimStreaksRef: RefObject<AimStreaks>;
  grabFrame: (video: HTMLVideoElement) => RgbaImage | null;
  hasSession: () => boolean;
  processFrame: (
    kind: SessionKind,
    frame: RgbaImage,
    index: number,
    seconds: number,
  ) => Promise<ScanWorkerOutcome | null>;
  setOverlayTarget: (input: ScanOverlayTargetInput) => void;
  shouldCatchUp: (settling: boolean, cardInGuide: boolean) => boolean;
  runCatchUp: () => Promise<void>;
  onError: (message: string) => void;
}

export interface ScanFrames {
  readout: ScannerReadout;
  startLoop: () => void;
  capture: () => Promise<void>;
  resetAimHint: () => void;
  clearHistory: () => void;
}

export function useScanFrames(options: ScanFramesOptions): ScanFrames {
  const {
    loaded,
    videoRef,
    runningRef,
    runGenerationRef,
    settingsRef,
    eventsRef,
    capturingRef,
    relockRef,
    settlingRef,
    tallyRef,
    idleGateRef,
    aimStreaksRef,
    rotationRef,
    sessionStartRef,
  } = options;
  // Whether the last processed frame had something plausible in the guide, so
  // the catch-up pass can tell "between cards" from "mid-scan".
  const cardInGuideRef = useRef(false);
  const locksRef = useRef<LockedCard[]>([]);
  const lastPublishRef = useRef(0);
  const fpsRef = useRef(createFpsWindow());
  const idlePaceRef = useRef(idlePaceStart());
  const aimHintSmootherRef = useRef(createAimHintSmoother());
  const [readout, setReadout] = useState<ScannerReadout>(EMPTY_READOUT);

  function publish(
    outcome: FrameOutcome,
    aim: ScannerReadout["aim"],
    runLength: number,
    lockRun: number,
    candidateAreaFraction: number,
    force: boolean,
  ) {
    const now = performance.now();
    const fps = fpsRef.current.sample(now);
    if (!publishDue(lastPublishRef.current, now, force)) {
      return;
    }
    lastPublishRef.current = now;
    const settling = settlingRef.current.disturbed;
    const aimHint = aimHintSmootherRef.current.update(
      deriveAimHint(aimHintInputFor(outcome, candidateAreaFraction, settling)),
      now,
    );
    setReadout(
      buildReadout({
        outcome,
        aim,
        aimHint,
        fps,
        locks: locksRef.current,
        runLength,
        lockRun,
        candidateAreaFraction,
        placements: tallyRef.current.placements(),
        missedPlacements: tallyRef.current.missedTotal(),
        missedSinceNamed: tallyRef.current.missedSinceNamed(),
        settling,
      }),
    );
  }

  function noteLock(outcome: FrameOutcome) {
    const track = outcome.locked;
    if (!track) {
      return;
    }
    // Re-arming (a placement signal or a two-frame dropout) doesn't mean a
    // new physical card when the phone is in a hand.
    if (settingsRef.current.mode === "single" && !relockRef.current.allows(track.artKey)) {
      console.log(`[scan] re-lock suppressed for ${track.label} (single mode)`);
      return;
    }
    relockRef.current.note(track.artKey, performance.now());
    const lock = lockFromTrack({
      track,
      tapped: settingsRef.current.mode === "capture",
      totalMs: outcome.timings.total,
      inliers: outcome.winner === null ? 0 : outcome.winner.inliers,
      at: Date.now(),
    });
    locksRef.current = appendLock(locksRef.current, lock);
    // Not one of the misses; also clears any prior miss streak the tray was
    // coaching the user to slow down for.
    tallyRef.current.noteNamed();
    options.clearPendingFrame();
    // What the user experiences, unlike lockSeconds which starts at the
    // first VERIFIED frame and hides the unverifiable stretch before it.
    const aimSeconds = aimStreaksRef.current.take(track.artKey, performance.now());
    const aimPart = aimSeconds === null ? "" : `, aim-to-lock ${aimSeconds.toFixed(2)}s`;
    console.log(
      `[scan] LOCK ${track.label} (${track.key}) after ${lock.framesToLock} frames, ${lock.lockSeconds.toFixed(2)}s${aimPart}`,
    );
    navigator.vibrate?.(50);
    eventsRef.current?.onLock?.(lock);
  }

  function notePrinting(outcome: FrameOutcome) {
    const update = outcome.printingTrack;
    if (!update) {
      return;
    }
    const printingLine = printingLogLine(outcome);
    if (printingLine !== null) {
      console.log(printingLine);
    }
    if (!update.resolved) {
      return;
    }
    const refreshed = resolvePrintingIn(locksRef.current, update);
    if (refreshed === null) {
      return;
    }
    locksRef.current = refreshed;
    eventsRef.current?.onLockResolved?.({
      artKey: update.artKey,
      key: update.key,
      label: update.label,
    });
  }

  function noteWinnerRotation(outcome: FrameOutcome): void {
    if (!outcome.winner) {
      return;
    }
    const winnerKey = outcome.winner.key;
    // A winner whose reference render is landscape (battlefields) reports a
    // non-zero rotation regardless of frame orientation — it says nothing
    // about the frame and must never drive adoption.
    if (loaded?.labels[winnerKey]?.type === "battlefield") {
      return;
    }
    const rotation = outcome.ranked.find((entry) => entry.key === winnerKey)?.rotation ?? 0;
    const adopted = rotationRef.current.note(rotation);
    if (adopted !== null) {
      console.log(`[scan] frame rotation adopted: +${rotation} quarter turns (now ${adopted})`);
    }
  }

  async function runFrame(): Promise<void> {
    const video = videoRef.current;
    if (!video || !options.hasSession()) {
      return;
    }
    if (settleBlocksFrame(settlingRef.current, performance.now(), capturingRef.current)) {
      return;
    }
    const turns = rotationRef.current.turns();
    const frame = options.grabFrame(video);
    if (!frame) {
      return;
    }

    const generation = runGenerationRef.current;
    const frameIndex = options.nextFrameIndex();
    const result = await options.processFrame(
      "live",
      frame,
      frameIndex,
      (performance.now() - sessionStartRef.current) / 1000,
    );
    if (!result) {
      return;
    }
    const outcome = result.outcome;
    if (generation !== runGenerationRef.current) {
      // Stop was pressed while this frame was in flight; a stale outcome must
      // not repaint the overlay or report a lock into the stopped run.
      return;
    }

    const rankedTop = outcome.ranked[0];
    cardInGuideRef.current =
      outcome.winner !== null ||
      (rankedTop !== undefined && rankedTop.distance <= idleGateRef.current);
    // Before noteLock, so the guide emptying and this frame's lock are judged
    // in the order they happened.
    relockRef.current.observe(cardInGuideRef.current, performance.now());
    let aimAgeSeconds = 0;
    let aim: ScannerReadout["aim"] = null;
    if (rankedTop) {
      const topArt = loaded?.artKeys.get(rankedTop.key) ?? rankedTop.key;
      aimAgeSeconds = aimStreaksRef.current.touch(topArt, performance.now());
      // Plausibility-gated: an empty guide still ranks SOMETHING first, but
      // far — surfacing that as "aiming at X" would suggest junk.
      if (rankedTop.distance <= idleGateRef.current) {
        aim = { artKey: topArt, key: rankedTop.key, seconds: aimAgeSeconds };
      }
    }

    noteLock(outcome);
    notePrinting(outcome);
    noteWinnerRotation(outcome);

    const topDistance = outcome.ranked[0]?.distance;
    const plausible =
      outcome.winner !== null || (topDistance !== undefined && topDistance <= idleGateRef.current);
    idlePaceRef.current = nextIdlePace(idlePaceRef.current, plausible, outcome.timings.total);

    console.log(frameLogLine(frameIndex, outcome, aimAgeSeconds));

    // Read off the accept layer's own track, so the ring only ever shows
    // what the session would actually lock on.
    const lockRun = lockRunForMode(settingsRef.current.mode);
    // Weighted so two strong frames read as further along than two marginal
    // ones, matching what the accept layer actually scores.
    const runLength = result.run ? Math.min(result.run.weight, lockRun) : 0;

    // Measured in the frame coordinates the quads live in; not derivable
    // outside this hook.
    const areaFraction =
      outcome.candidate === null
        ? 0
        : areaFractionOfGuide(outcome.candidate.quad, centeredGuideQuad(frame.width, frame.height));
    options.setOverlayTarget({
      quad: outcome.winner === null ? null : (outcome.candidate?.quad ?? null),
      guide: settingsRef.current.mode !== "pan",
      frameWidth: frame.width,
      frameHeight: frame.height,
      turns,
      focus: outcome.focus,
      runLength,
      lockRun,
    });
    publish(outcome, aim, runLength, lockRun, areaFraction, outcome.locked !== null);
  }

  function startLoop(): void {
    // Declared here, not at hook level, so the loop never references a
    // hoisted function by name; the React Compiler bails out on that.
    const loop = () => {
      if (!runningRef.current) {
        return;
      }
      if (settingsRef.current.paused) {
        setTimeout(() => requestAnimationFrame(loop), PAUSED_POLL_MS);
        return;
      }
      // Live scanning always wins the frame slot; the second look only runs
      // when the guide is quiet.
      const inFlight = options.shouldCatchUp(settlingRef.current.disturbed, cardInGuideRef.current)
        ? options.runCatchUp()
        : runFrame();
      options.setFrameInFlight(inFlight);
      const scheduleNext = () => {
        if (shouldPaceFrame(idlePaceRef.current, settingsRef.current.mode)) {
          setTimeout(() => requestAnimationFrame(loop), IDLE_PACE_DELAY_MS);
        } else {
          requestAnimationFrame(loop);
        }
      };
      /* oxlint-disable promise/prefer-await-to-then, promise/prefer-catch -- the rAF loop is callback-shaped; a rejected frame must not kill it */
      inFlight.then(scheduleNext, (frameError: unknown) => {
        options.onError(errorText(frameError, "Frame processing failed"));
        scheduleNext();
      });
      /* oxlint-enable promise/prefer-await-to-then, promise/prefer-catch */
    };
    idlePaceRef.current = idlePaceStart();
    aimStreaksRef.current.clear();
    requestAnimationFrame(loop);
  }

  /**
   * The frame shares the live session, so repeated captures of one card
   * build an agreeing run and can lock like live frames.
   */
  async function capture(): Promise<void> {
    if (!runningRef.current || capturingRef.current) {
      return;
    }
    options.setCapturing(true);
    const inFlight = runFrame();
    options.setFrameInFlight(inFlight);
    try {
      await inFlight;
    } catch (captureError) {
      options.onError(errorText(captureError, "Frame processing failed"));
    }
    options.setCapturing(false);
  }

  function resetAimHint(): void {
    aimHintSmootherRef.current.reset();
  }

  function clearHistory(): void {
    locksRef.current = [];
    fpsRef.current.clear();
    aimStreaksRef.current.clear();
    setReadout({ ...EMPTY_READOUT });
  }

  return { readout, startLoop, capture, resetAimHint, clearHistory };
}
