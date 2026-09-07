import type {
  CardCandidate,
  FrameOutcome,
  PlacementDetector,
  RankedEmbed,
  RgbaImage,
  ScanSession,
} from "@openrift/shared/scan";
import {
  DEFAULT_SESSION_OPTIONS,
  IDLE_AFTER_NO_WINNER_FRAMES,
  centeredGuideQuad,
  createPlacementDetector,
  toGray,
} from "@openrift/shared/scan";
import { useEffect, useRef, useState } from "react";

import { cameraErrorMessage } from "@/lib/camera-error";
import type { CameraInfo } from "@/lib/camera-info";
import { readCameraInfo } from "@/lib/camera-info";
import { errorText } from "@/lib/error-text";
import type { AimHint } from "@/lib/scan-aim-hint";
import { areaFractionOfGuide, createAimHintSmoother, deriveAimHint } from "@/lib/scan-aim-hint";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import { acquireScannerStream } from "@/lib/scan-camera";
import { catchUpVerdict, createCatchUpQueue, shouldRunCatchUp } from "@/lib/scan-catchup";
import {
  SLOW_DEVICE_EMBED_MS,
  embedderImageSize,
  measuredEmbedMsPerImage,
} from "@/lib/scan-embedder";
import { guideRectIn, snapshotVideoRect } from "@/lib/scan-flight";
import type { ReticleGrade } from "@/lib/scan-overlay";
import { gradeReticle, lockRingFraction } from "@/lib/scan-overlay";
import type { OverlayTarget } from "@/lib/scan-overlay-paint";
import { createDrawState, paintOverlay, syncOverlaySize } from "@/lib/scan-overlay-paint";
import { createPlacementTally } from "@/lib/scan-placement-counts";
import { createRelockGuard } from "@/lib/scan-relock";
import type { ScanSessionPlan, ScannerMode } from "@/lib/scan-session";
import {
  createConfiguredScanSession,
  gatesForBank,
  lockRunForMode,
  scanSessionPlans,
} from "@/lib/scan-session";
import type { ScanWorkerOutcome, SessionKind } from "@/workers/scan-worker";

import type { ScanEngineAssets } from "./use-scan-engine";
import { useScanEngine } from "./use-scan-engine";

export interface ScannerSettings {
  mode: ScannerMode;
  processingSize: number;
  candidatesToTry: number;
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  mode: "single",
  processingSize: 848,
  candidatesToTry: DEFAULT_SESSION_OPTIONS.candidatesToTry,
};

const IDLE_PACE_DELAY_MS = 300;
const IDLE_PACE_MIN_FRAME_MS = 400;

const WATCH_LONG_SIDE = 128;

const SETTLE_TRUST_MS = 500;

const AIM_STREAK_GAP_MS = 3000;

export interface UnidentifiedCard {
  id: string;
  thumbnail: string | null;
  candidates: { key: string; artKey: string }[];
  at: number;
}

export interface IdentifyAttempt {
  snapshot: string | null;
  identified: boolean;
  candidates: { key: string; artKey: string }[];
}

export interface LockedCard {
  key: string;
  artKey: string;
  label: string;
  resolved: boolean;
  at: number;
  lockSeconds: number;
  framesToLock: number;
  inliers: number;
}

export interface ScannerEvents {
  onLock?: (lock: LockedCard) => void;
  onLockResolved?: (update: { artKey: string; key: string; label: string }) => void;
}

export interface ScannerReadout {
  candidate: CardCandidate | null;
  ranked: RankedEmbed[];
  winnerKey: string | null;
  winnerInliers: number;
  rivalInliers: number;
  refused: boolean;
  bestInliers: number;
  focus: number;
  fps: number;
  detectMs: number;
  embedMs: number;
  verifyMs: number;
  totalMs: number;
  locks: LockedCard[];
  aim: { artKey: string; key: string; seconds: number } | null;
  lockProgress: { runLength: number; lockRun: number };
  candidateAreaFraction: number;
  placements: number;
  missedPlacements: number;
  missedSinceNamed: number;
  settling: boolean;
  aimHint: AimHint | null;
}

const EMPTY_READOUT: ScannerReadout = {
  candidate: null,
  ranked: [],
  winnerKey: null,
  winnerInliers: 0,
  rivalInliers: 0,
  refused: false,
  bestInliers: 0,
  focus: 0,
  fps: 0,
  detectMs: 0,
  embedMs: 0,
  verifyMs: 0,
  totalMs: 0,
  locks: [],
  aim: null,
  lockProgress: { runLength: 0, lockRun: 0 },
  candidateAreaFraction: 0,
  placements: 0,
  missedPlacements: 0,
  missedSinceNamed: 0,
  settling: false,
  aimHint: null,
};

export function useCardScanner(
  loaded: LoadedScanBank | null,
  settings: ScannerSettings,
  assets: ScanEngineAssets | null,
  events?: ScannerEvents,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  // Bumped by stop and unmount. A start that was awaiting the camera when the
  // bump happened must not bring the stream up for a page that moved on.
  const runGenerationRef = useRef(0);
  const sessionRef = useRef<ScanSession | null>(null);
  const frameInFlightRef = useRef<Promise<unknown> | null>(null);
  const frameIndexRef = useRef(0);
  const sessionStartRef = useRef(0);
  const locksRef = useRef<LockedCard[]>([]);
  const settingsRef = useRef(settings);
  const eventsRef = useRef(events);
  const lastPublishRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const idlePaceRef = useRef({ streak: 0, lastTotalMs: 0 });
  const idleGateRef = useRef(DEFAULT_SESSION_OPTIONS.rotationFallbackDistance);
  const aimSinceRef = useRef(new Map<string, { since: number; lastSeen: number }>());
  // Android can hand over a camera buffer rotated relative to the display.
  // Adopted once two consecutive verified winners agree on a rotation.
  const frameTurnsRef = useRef(0);
  const winnerRotationStreakRef = useRef({ rotation: 0, count: 0 });
  // A capture-mode tap in flight; further taps are ignored until it settles.
  const capturingRef = useRef(false);
  // One adoption per proof: stays disarmed until an upright winner confirms
  // it, or a landscape-reference card (battlefields) would spin it forever.
  const rotationAdoptionArmedRef = useRef(true);
  const watchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const placementRef = useRef<PlacementDetector | null>(null);
  const placementTallyRef = useRef(createPlacementTally());
  const aimHintSmootherRef = useRef(createAimHintSmoother());
  // Fed on every processed frame in every mode, so switching to single mode
  // mid-session finds it already up to date.
  const relockRef = useRef(createRelockGuard());
  const settlingRef = useRef({ disturbed: false, at: 0 });
  // Whether the last processed frame had something plausible in the guide, so
  // the catch-up pass can tell "between cards" from "mid-scan".
  const cardInGuideRef = useRef(false);
  // Replayed through a second, never-locking session: a single frame can't
  // earn a run, and the live session's run must not be corrupted by it.
  const catchUpQueueRef = useRef(createCatchUpQueue());
  const catchUpSessionRef = useRef<ScanSession | null>(null);
  const catchUpBusyRef = useRef(false);
  const [catchUpPending, setCatchUpPending] = useState<UnidentifiedCard[]>([]);
  // The frame the last placement settled on, held until that placement either
  // produces a lock or is written off as a miss.
  const pendingFrameRef = useRef<{ frame: RgbaImage; thumbnail: string | null } | null>(null);
  const catchUpSeqRef = useRef(0);

  const overlayTargetRef = useRef<OverlayTarget | null>(null);
  const overlayDrawRef = useRef(createDrawState());

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<ScannerReadout>(EMPTY_READOUT);
  // Kept past stop() on purpose: it's a snapshot, safer to read once the
  // camera (and its battery drain) is off.
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);

  // The engine's loaders live in their own hook; the refs it returns are
  // written only there, this hook only ever reads them.
  const { cvRef, embedderRef, workerRef, cvReady, embedderReady, embedMsPerImage, engineProgress } =
    useScanEngine(assets, setError);

  // Kept off the paint cadence: measuring the video every animation frame causes layout thrash.
  useEffect(() => {
    const resize = () => {
      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        syncOverlaySize(canvas, video);
      }
      // Resizing a canvas clears it; the painter must redraw.
      overlayDrawRef.current.settled = false;
      overlayDrawRef.current.shown = false;
    };
    globalThis.addEventListener("resize", resize);
    globalThis.addEventListener("orientationchange", resize);
    return () => {
      globalThis.removeEventListener("resize", resize);
      globalThis.removeEventListener("orientationchange", resize);
    };
  }, []);

  // Written in an effect, not during render, so the React Compiler doesn't
  // bail out of the whole hook.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Same treatment for the lock callbacks: consumers pass fresh closures per
  // render, and the loop must always call the latest without restarting.
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Releases the session's OpenCV allocations only after any in-flight frame
  // has finished with them.
  useEffect(
    () => () => {
      runGenerationRef.current++;
      runningRef.current = false;
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      streamRef.current = null;
      const inFlight = frameInFlightRef.current;
      const session = sessionRef.current;
      const catchUpSession = catchUpSessionRef.current;
      sessionRef.current = null;
      catchUpSessionRef.current = null;
      // oxlint-disable-next-line promise/prefer-await-to-then, promise/always-return -- a cleanup cannot await, and releasing returns nothing
      void Promise.resolve(inFlight).then(() => {
        session?.release();
        catchUpSession?.release();
        return null;
      });
    },
    [],
  );

  /**
   * Shared by the in-page and worker paths: the plan is plain data, so the
   * worker rebuilds the identical pair from the same description.
   */
  function sessionPlans(
    embedMs: number,
  ): { live: ScanSessionPlan; catchUp: ScanSessionPlan } | null {
    if (!loaded) {
      return null;
    }
    // Distance gates are calibrated per encoder; the served bank's dimension
    // says which encoder produced it.
    const gates = gatesForBank(loaded.bank);
    idleGateRef.current = gates.rotationFallbackDistance;
    const slowDevice = embedMs > SLOW_DEVICE_EMBED_MS;
    if (slowDevice) {
      console.log(`[scan] slow-device profile (${embedMs.toFixed(0)}ms/image)`);
    }
    return scanSessionPlans({
      mode: settingsRef.current.mode,
      candidatesToTry: settingsRef.current.candidatesToTry,
      slowDevice,
      gates,
      canonical: loaded.canonical,
    });
  }

  function createSessions(plans: { live: ScanSessionPlan; catchUp: ScanSessionPlan }): {
    live: ScanSession;
    catchUp: ScanSession;
  } | null {
    const cv = cvRef.current;
    const embedder = embedderRef.current;
    if (!cv || !embedder || !loaded) {
      return null;
    }
    const engine = { cv, embedder, embedImageSize: embedderImageSize() };
    return {
      live: createConfiguredScanSession(engine, loaded, plans.live),
      catchUp: createConfiguredScanSession(engine, loaded, plans.catchUp),
    };
  }

  function grabFrame(video: HTMLVideoElement, turns: number): RgbaImage | null {
    const { videoWidth, videoHeight } = video;
    if (videoWidth === 0 || videoHeight === 0) {
      return null;
    }
    const scale = Math.min(
      1,
      settingsRef.current.processingSize / Math.max(videoWidth, videoHeight),
    );
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);

    // Written long-hand: the React Compiler cannot lower `??=` and bails out of
    // the whole hook if it sees one.
    if (!workCanvasRef.current) {
      workCanvasRef.current = document.createElement("canvas");
    }
    const canvas = workCanvasRef.current;
    const rotatedWidth = turns % 2 === 1 ? height : width;
    const rotatedHeight = turns % 2 === 1 ? width : height;
    if (canvas.width !== rotatedWidth || canvas.height !== rotatedHeight) {
      canvas.width = rotatedWidth;
      canvas.height = rotatedHeight;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.save();
    if (turns === 1) {
      context.translate(rotatedWidth, 0);
    } else if (turns === 2) {
      context.translate(rotatedWidth, rotatedHeight);
    } else if (turns === 3) {
      context.translate(0, rotatedHeight);
    }
    context.rotate((turns * Math.PI) / 2);
    context.drawImage(video, 0, 0, width, height);
    context.restore();
    const data = context.getImageData(0, 0, rotatedWidth, rotatedHeight);
    return { data: data.data, width: rotatedWidth, height: rotatedHeight };
  }

  /**
   * Independent of the pipeline: a phone processing 5 fps can spend a whole
   * second inside two frames, too slow to catch a card landing on its own.
   */
  function watchPlacement(video: HTMLVideoElement, now: number): void {
    const detector = placementRef.current;
    const { videoWidth, videoHeight } = video;
    if (!detector || videoWidth === 0 || videoHeight === 0) {
      return;
    }
    const scale = Math.min(1, WATCH_LONG_SIDE / Math.max(videoWidth, videoHeight));
    const width = Math.max(1, Math.round(videoWidth * scale));
    const height = Math.max(1, Math.round(videoHeight * scale));

    // Written long-hand: the React Compiler cannot lower `??=`.
    if (!watchCanvasRef.current) {
      watchCanvasRef.current = document.createElement("canvas");
    }
    const canvas = watchCanvasRef.current;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    // Runs in the camera's own frame; rotation compensation doesn't apply
    // since the detector only compares consecutive frames.
    const signal = detector.observe(
      toGray({ data: pixels.data, width, height }),
      centeredGuideQuad(width, height),
    );
    const tally = placementTallyRef.current;
    // Must update now, not when the next card arrives, or the session's
    // last card goes uncounted.
    settlingRef.current = { disturbed: signal.disturbed, at: now };
    // Single mode only: handheld, "a card came to rest" fires on hand tremor,
    // producing counts and misses for cards never placed at all.
    if (settingsRef.current.mode === "single") {
      return;
    }
    if (tally.takeMiss(now)) {
      // The card is gone, but the frame it settled on remains; recognising it
      // now costs a frame slot the live pass didn't have.
      const pending = pendingFrameRef.current;
      pendingFrameRef.current = null;
      if (pending) {
        catchUpSeqRef.current += 1;
        catchUpQueueRef.current.push({
          id: `catchup-${catchUpSeqRef.current}`,
          frame: pending.frame,
          thumbnail: pending.thumbnail,
          at: now,
        });
      }
    }
    if (!signal.placed) {
      return;
    }
    tally.notePlacement(now);
    // The settle frame is the sharpest view of this card there will be: the
    // motion has stopped and the next thing to happen is the card leaving.
    const frame = grabFrame(video, frameTurnsRef.current);
    pendingFrameRef.current = frame
      ? {
          frame,
          thumbnail: snapshotVideoRect(video, guideRectIn(video.getBoundingClientRect())),
        }
      : null;
    rearmEngine();
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
    const streak = winnerRotationStreakRef.current;
    if (rotation === 0) {
      streak.rotation = 0;
      streak.count = 0;
      // An upright winner is proof the current compensation is correct;
      // re-arm so a later card placed differently can adopt again.
      rotationAdoptionArmedRef.current = true;
      return;
    }
    if (streak.rotation === rotation) {
      streak.count += 1;
    } else {
      streak.rotation = rotation;
      streak.count = 1;
    }
    if (streak.count >= 2 && rotationAdoptionArmedRef.current) {
      frameTurnsRef.current = (frameTurnsRef.current + rotation) % 4;
      streak.rotation = 0;
      streak.count = 0;
      rotationAdoptionArmedRef.current = false;
      console.log(
        `[scan] frame rotation adopted: +${rotation} quarter turns (now ${frameTurnsRef.current})`,
      );
    }
  }

  /**
   * The pipeline lands 5-15 times a second, too rarely to look like tracking
   * on its own; the animation-frame painter owns drawing from this target.
   */
  function updateOverlayTarget(
    candidate: CardCandidate | null,
    grade: ReticleGrade,
    frameWidth: number,
    frameHeight: number,
    turns: number,
    focus: number,
    runLength: number,
    lockRun: number,
  ): void {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }
    // The only layout read in the overlay path; must stay on the pipeline
    // cadence, not the painter's.
    syncOverlaySize(canvas, video);
    overlayTargetRef.current = {
      quad: candidate?.quad ?? null,
      guide: settingsRef.current.mode === "pan" ? null : centeredGuideQuad(frameWidth, frameHeight),
      frameWidth,
      frameHeight,
      turns,
      grade,
      dashed: grade.state === "seeking",
      focus,
      lockFraction: lockRingFraction(runLength, lockRun),
      lockRun,
    };
  }

  function publish(
    outcome: FrameOutcome,
    aim: ScannerReadout["aim"],
    runLength: number,
    lockRun: number,
    candidateAreaFraction: number,
    force: boolean,
  ) {
    const now = performance.now();
    frameTimesRef.current.push(now);
    while (frameTimesRef.current.length > 0 && now - frameTimesRef.current[0] > 1000) {
      frameTimesRef.current.shift();
    }

    // Throttled: the numbers are unreadable faster than this anyway. A lock
    // publishes immediately so it never feels delayed.
    if (!force && now - lastPublishRef.current < 150) {
      return;
    }
    lastPublishRef.current = now;
    const aimHint = aimHintSmootherRef.current.update(
      deriveAimHint({
        active: true,
        hasCandidate: outcome.candidate !== null,
        candidateAreaFraction,
        bestInliers: outcome.bestInliers,
        focus: outcome.focus,
        topDistance: outcome.ranked[0]?.distance,
        refused: outcome.refused,
        isWinner: outcome.winner !== null,
        settling: settlingRef.current.disturbed,
      }),
      now,
    );
    setReadout({
      candidate: outcome.candidate,
      ranked: outcome.ranked.slice(0, 5),
      winnerKey: outcome.winner === null ? null : outcome.winner.key,
      winnerInliers: outcome.winner === null ? 0 : outcome.winner.inliers,
      rivalInliers: outcome.winner === null ? 0 : outcome.winner.rivalInliers,
      refused: outcome.refused,
      bestInliers: outcome.bestInliers,
      focus: outcome.focus,
      fps: frameTimesRef.current.length,
      detectMs: outcome.timings.detect,
      embedMs: outcome.timings.embed,
      verifyMs: outcome.timings.verify,
      totalMs: outcome.timings.total,
      locks: locksRef.current,
      aim,
      lockProgress: { runLength, lockRun },
      candidateAreaFraction,
      placements: placementTallyRef.current.placements(),
      missedPlacements: placementTallyRef.current.missedTotal(),
      missedSinceNamed: placementTallyRef.current.missedSinceNamed(),
      settling: settlingRef.current.disturbed,
      aimHint,
    });
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
    // A capture-mode lock is one deliberate tap, so run time is always
    // 0.00s; what matters there is how long the tap took to process.
    const tapped = settingsRef.current.mode === "capture";
    const lockSeconds = tapped
      ? outcome.timings.total / 1000
      : (track.lockedAt ?? track.runStartSeconds) - track.runStartSeconds;
    const framesToLock = tapped ? 1 : (track.framesToLock ?? 0);
    const lock: LockedCard = {
      key: track.key,
      artKey: track.artKey,
      label: track.label,
      resolved: track.printingResolved,
      at: Date.now(),
      lockSeconds,
      framesToLock,
      inliers: outcome.winner === null ? 0 : outcome.winner.inliers,
    };
    locksRef.current = [lock, ...locksRef.current].slice(0, 30);
    // Not one of the misses; also clears any prior miss streak the tray was
    // coaching the user to slow down for.
    placementTallyRef.current.noteNamed();
    pendingFrameRef.current = null;
    // What the user experiences, unlike lockSeconds which starts at the
    // first VERIFIED frame and hides the unverifiable stretch before it.
    const aimed = aimSinceRef.current.get(track.artKey);
    const aimSeconds = aimed ? (performance.now() - aimed.since) / 1000 : null;
    aimSinceRef.current.delete(track.artKey);
    const aimPart = aimSeconds === null ? "" : `, aim-to-lock ${aimSeconds.toFixed(2)}s`;
    console.log(
      `[scan] LOCK ${track.label} (${track.key}) after ${framesToLock} frames, ${lockSeconds.toFixed(2)}s${aimPart}`,
    );
    navigator.vibrate?.(50);
    eventsRef.current?.onLock?.(lock);
  }

  function notePrinting(outcome: FrameOutcome) {
    const update = outcome.printingTrack;
    if (!update) {
      return;
    }
    if (outcome.printingScores) {
      const summary = outcome.printingScores
        .slice(0, 4)
        .map((entry) => `${entry.key.slice(0, 8)}=${entry.score.toFixed(3)}`)
        .join(" ");
      const verdict =
        outcome.printingMargin === undefined
          ? "abstained"
          : `picked via ${outcome.printingVia} margin ${outcome.printingMargin.toFixed(3)}`;
      console.log(`[scan] PRINTING ${update.label} ${verdict} | band ${summary}`);
    }
    if (!update.resolved) {
      return;
    }
    // A follow-up frame resolved the printing after the lock was already
    // listed; refresh the newest entry for that artwork in place.
    const index = locksRef.current.findIndex((lock) => lock.artKey === update.artKey);
    if (index === -1 || locksRef.current[index].key === update.key) {
      return;
    }
    const refreshed = [...locksRef.current];
    refreshed[index] = {
      ...refreshed[index],
      key: update.key,
      label: update.label,
      resolved: true,
    };
    locksRef.current = refreshed;
    eventsRef.current?.onLockResolved?.({
      artKey: update.artKey,
      key: update.key,
      label: update.label,
    });
  }

  /**
   * Frames handed to the worker are transferred; the buffer must not be
   * touched after this call either way.
   */
  async function processFrameVia(
    kind: SessionKind,
    frame: RgbaImage,
    index: number,
    seconds: number,
  ): Promise<ScanWorkerOutcome | null> {
    const client = workerRef.current;
    if (client) {
      return await client.processFrame(kind, frame, index, seconds);
    }
    const session = kind === "live" ? sessionRef.current : catchUpSessionRef.current;
    if (!session) {
      return null;
    }
    const outcome = await session.processFrame(frame, index, seconds, () => performance.now());
    const track = outcome.winner ? session.state.get(outcome.winner.artKey) : undefined;
    return {
      outcome,
      run: track ? { length: track.runLength, weight: track.runWeight } : null,
    };
  }

  function rearmEngine(): void {
    if (workerRef.current) {
      workerRef.current.rearm();
      return;
    }
    sessionRef.current?.rearm();
  }

  function rankedArtworks(ranked: readonly RankedEmbed[]): { key: string; artKey: string }[] {
    const seen = new Set<string>();
    const candidates: { key: string; artKey: string }[] = [];
    for (const entry of ranked) {
      const artKey = loaded?.artKeys.get(entry.key) ?? entry.key;
      if (seen.has(artKey)) {
        continue;
      }
      seen.add(artKey);
      candidates.push({ key: entry.key, artKey });
    }
    return candidates;
  }

  /**
   * Runs through its own session so the live pass's run stays intact; that
   * session never locks, since a lone frame has no run behind it.
   */
  async function runCatchUp(): Promise<void> {
    const entry = catchUpQueueRef.current.take();
    if (!entry) {
      return;
    }
    catchUpBusyRef.current = true;
    const generation = runGenerationRef.current;
    // The optional access lives outside the try on purpose: the React Compiler
    // cannot lower a conditional inside one and bails out of the whole hook.
    let result: ScanWorkerOutcome | null = null;
    try {
      result = await processFrameVia(
        "catchUp",
        entry.frame,
        catchUpSeqRef.current,
        (performance.now() - sessionStartRef.current) / 1000,
      );
    } catch (catchUpError) {
      // Deliberately swallowed: the card is already counted as a miss and
      // the live pass must not be interrupted.
      console.log(`[scan] catch-up failed: ${errorText(catchUpError, "unknown")}`);
    }
    const outcome = result === null ? null : result.outcome;
    catchUpBusyRef.current = false;
    if (generation !== runGenerationRef.current || !outcome) {
      return;
    }
    const verdict = catchUpVerdict(
      outcome.winner,
      DEFAULT_SESSION_OPTIONS.minInliers,
      DEFAULT_SESSION_OPTIONS.margin,
    );
    console.log(
      `[scan] catch-up ${entry.id}: ${verdict}` +
        `${outcome.winner ? ` ${outcome.winner.key} inliers ${outcome.winner.inliers} vs rival ${outcome.winner.rivalInliers}` : " nothing verified"}`,
    );
    if (verdict === "discard") {
      return;
    }
    if (verdict === "add" && outcome.winner) {
      const winner = outcome.winner;
      // Must decrement by one, not reset: other cards from the same burst
      // may still be genuinely unaccounted for.
      placementTallyRef.current.noteRecovered();
      // Reported like any other lock, so the page's resolve, picker and tray
      // behave identically to a card the live pass caught.
      eventsRef.current?.onLock?.({
        key: winner.key,
        artKey: winner.artKey,
        label: describeKey(loaded?.labels ?? {}, winner.key),
        resolved: false,
        at: Date.now(),
        lockSeconds: outcome.timings.total / 1000,
        framesToLock: 1,
        inliers: winner.inliers,
      });
      return;
    }
    setCatchUpPending((current) => [
      ...current,
      {
        id: entry.id,
        thumbnail: entry.thumbnail,
        candidates: rankedArtworks(outcome.ranked).slice(0, 4),
        at: entry.at,
      },
    ]);
  }

  /**
   * Must grab a fresh frame: the published readout can lag behind a stale
   * card while the guide idles or settles.
   */
  async function identifyNow(
    onSnapshot?: (snapshot: string | null) => void,
  ): Promise<IdentifyAttempt> {
    const video = videoRef.current;
    if (!video || !runningRef.current) {
      return { snapshot: null, identified: false, candidates: [] };
    }
    const snapshot = snapshotVideoRect(video, guideRectIn(video.getBoundingClientRect()));
    onSnapshot?.(snapshot);
    const frame = grabFrame(video, frameTurnsRef.current);
    if (!frame) {
      return { snapshot, identified: false, candidates: [] };
    }
    const generation = runGenerationRef.current;
    catchUpSeqRef.current += 1;
    catchUpBusyRef.current = true;
    // The optional access lives outside the try on purpose: the React Compiler
    // cannot lower a conditional inside one and bails out of the whole hook.
    let result: ScanWorkerOutcome | null = null;
    try {
      result = await processFrameVia(
        "catchUp",
        frame,
        catchUpSeqRef.current,
        (performance.now() - sessionStartRef.current) / 1000,
      );
    } catch (identifyError) {
      console.log(`[scan] identify-now failed: ${errorText(identifyError, "unknown")}`);
    }
    catchUpBusyRef.current = false;
    const outcome = result === null ? null : result.outcome;
    if (!outcome || generation !== runGenerationRef.current) {
      return { snapshot, identified: false, candidates: [] };
    }
    const verdict = catchUpVerdict(
      outcome.winner,
      DEFAULT_SESSION_OPTIONS.minInliers,
      DEFAULT_SESSION_OPTIONS.margin,
    );
    console.log(
      `[scan] identify-now: ${verdict}` +
        `${outcome.winner ? ` ${outcome.winner.key} inliers ${outcome.winner.inliers} vs rival ${outcome.winner.rivalInliers}` : " nothing verified"}`,
    );
    if (verdict === "add" && outcome.winner) {
      const winner = outcome.winner;
      // Bypasses the re-lock guard but still counts as an add, or the live
      // pass would lock the same card again and add an unwanted copy.
      relockRef.current.note(winner.artKey, performance.now());
      navigator.vibrate?.(50);
      eventsRef.current?.onLock?.({
        key: winner.key,
        artKey: winner.artKey,
        label: describeKey(loaded?.labels ?? {}, winner.key),
        resolved: false,
        at: Date.now(),
        lockSeconds: outcome.timings.total / 1000,
        framesToLock: 1,
        inliers: winner.inliers,
      });
      return { snapshot, identified: true, candidates: [] };
    }
    return { snapshot, identified: false, candidates: rankedArtworks(outcome.ranked).slice(0, 4) };
  }

  async function runFrame(): Promise<void> {
    const video = videoRef.current;
    if (!video || (!sessionRef.current && !workerRef.current)) {
      return;
    }
    // Mid-swap frames are blurred or half-occluded; the watcher's verdict
    // gates them out. Capture mode is exempt: a tap always runs.
    const settling = settlingRef.current;
    if (
      settling.disturbed &&
      performance.now() - settling.at < SETTLE_TRUST_MS &&
      !capturingRef.current
    ) {
      return;
    }
    const turns = frameTurnsRef.current;
    const frame = grabFrame(video, turns);
    if (!frame) {
      return;
    }

    const generation = runGenerationRef.current;
    const result = await processFrameVia(
      "live",
      frame,
      frameIndexRef.current++,
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
      const nowMs = performance.now();
      const streak = aimSinceRef.current.get(topArt);
      if (!streak || nowMs - streak.lastSeen > AIM_STREAK_GAP_MS) {
        aimSinceRef.current.set(topArt, { since: nowMs, lastSeen: nowMs });
      } else {
        streak.lastSeen = nowMs;
      }
      aimAgeSeconds = (nowMs - (aimSinceRef.current.get(topArt)?.since ?? nowMs)) / 1000;
      // Plausibility-gated: an empty guide still ranks SOMETHING first, but
      // far — surfacing that as "aiming at X" would suggest junk.
      if (rankedTop.distance <= idleGateRef.current) {
        aim = { artKey: topArt, key: rankedTop.key, seconds: aimAgeSeconds };
      }
    }

    noteLock(outcome);
    notePrinting(outcome);
    noteWinnerRotation(outcome);

    // Same reset rule as the session's idle backoff, so pacing lifts on the
    // same frame the full search returns.
    const topDistance = outcome.ranked[0]?.distance;
    const plausible =
      outcome.winner !== null || (topDistance !== undefined && topDistance <= idleGateRef.current);
    idlePaceRef.current = {
      streak: plausible ? 0 : idlePaceRef.current.streak + 1,
      lastTotalMs: outcome.timings.total,
    };

    // Dev diagnostic: the devtools vite plugin pipes this to the terminal, so
    // phone runs can be watched from the dev-server log.
    const timings = outcome.timings;
    const top = outcome.ranked[0];
    // Aim age exposes the streak the LOCK line's aim-to-lock reads from; a
    // shorter lock than the age just printed means the streak was lost.
    const topPart = top
      ? ` top ${top.key} d${top.distance.toFixed(3)} r${top.rotation} aim ${aimAgeSeconds.toFixed(1)}s`
      : " no-candidate";
    const winnerPart = outcome.winner
      ? ` winner ${outcome.winner.key} inliers ${outcome.winner.inliers} rival ${outcome.winner.rivalInliers}`
      : `${outcome.refused ? " refused" : ""}${
          // How close a failing frame came to the 11-inlier floor; the gap
          // between "almost verified" and "hopeless" is the diagnostic.
          outcome.bestInliers > 0 ? ` best-inliers ${outcome.bestInliers}` : ""
        }`;
    console.log(
      `[scan] #${frameIndexRef.current - 1} ${timings.total.toFixed(0)}ms (detect ${timings.detect.toFixed(0)}, embed ${timings.embed.toFixed(0)}, verify ${timings.verify.toFixed(0)}) focus ${outcome.focus.toFixed(0)}${topPart}${winnerPart}`,
    );

    // Read off the accept layer's own track, so the ring only ever shows
    // what the session would actually lock on.
    const lockRun = lockRunForMode(settingsRef.current.mode);
    // Weighted so two strong frames read as further along than two marginal
    // ones, matching what the accept layer actually scores.
    const runLength = result.run ? Math.min(result.run.weight, lockRun) : 0;

    const grade = gradeReticle({
      hasCandidate: outcome.candidate !== null,
      bestInliers: outcome.bestInliers,
      refused: outcome.refused,
      isWinner: outcome.winner !== null,
    });
    // Measured on the same candidate the reticle grades and in the same
    // frame coordinates the quads live in; not derivable outside this hook.
    const areaFraction =
      outcome.candidate === null
        ? 0
        : areaFractionOfGuide(outcome.candidate.quad, centeredGuideQuad(frame.width, frame.height));
    updateOverlayTarget(
      outcome.candidate,
      grade,
      frame.width,
      frame.height,
      turns,
      outcome.focus,
      runLength,
      lockRun,
    );
    publish(outcome, aim, runLength, lockRun, areaFraction, outcome.locked !== null);
  }

  async function start() {
    // The Start button stays enabled until the camera opens; without this a
    // double tap leaks the first call's stream.
    if (startingRef.current || runningRef.current) {
      return;
    }
    startingRef.current = true;
    const generation = runGenerationRef.current;
    setError(null);

    // A failed previous start can leave a stream behind (play() rejected after
    // the camera opened); release it before opening a new one.
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;

    // A previous run's frame may still hold the session's OpenCV allocations;
    // wait it out before replacing the session.
    await Promise.resolve(frameInFlightRef.current);
    sessionRef.current?.release();
    catchUpSessionRef.current?.release();
    // The worker measures the encoder on its own thread and reports the cost
    // back; in-page the module-level self-bench holds it.
    const worker = workerRef.current;
    const plans = sessionPlans(worker ? embedMsPerImage : measuredEmbedMsPerImage());
    if (worker && plans) {
      worker.create(plans.live, plans.catchUp);
    } else {
      const sessions = plans ? createSessions(plans) : null;
      sessionRef.current = sessions === null ? null : sessions.live;
      catchUpSessionRef.current = sessions === null ? null : sessions.catchUp;
    }
    catchUpQueueRef.current.clear();
    catchUpBusyRef.current = false;
    pendingFrameRef.current = null;
    setCatchUpPending([]);
    if (!sessionRef.current && !workerRef.current) {
      setError("The engine is still loading, try again in a moment.");
      startingRef.current = false;
      return;
    }
    frameIndexRef.current = 0;
    sessionStartRef.current = performance.now();
    // A fresh camera track can come up in a different orientation, so the
    // adopted rotation starts over.
    frameTurnsRef.current = 0;
    winnerRotationStreakRef.current = { rotation: 0, count: 0 };
    rotationAdoptionArmedRef.current = true;

    // The React Compiler bails out of the whole hook on a `finally` clause or
    // on conditionals/loops inside try/catch, so control flow stays outside.
    const capFrameRate = measuredEmbedMsPerImage() > SLOW_DEVICE_EMBED_MS;
    const acquired = await acquireScannerStream(capFrameRate);
    const stream = acquired.stream;
    if (stream === null) {
      setError(cameraErrorMessage(acquired.failure, "Could not open the camera"));
      startingRef.current = false;
      return;
    }

    if (generation !== runGenerationRef.current) {
      // Stop was pressed or the page unmounted while the permission prompt
      // was open; without this the camera light stays on with no way off.
      for (const track of stream.getTracks()) {
        track.stop();
      }
      startingRef.current = false;
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    let playFailure: string | null = null;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch (playError) {
        playFailure = errorText(playError, "Could not start the camera preview");
      }
    }
    if (playFailure !== null) {
      setError(playFailure);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
      startingRef.current = false;
      return;
    }

    runningRef.current = true;
    setActive(true);
    console.log(
      `[scan] START mode ${settingsRef.current.mode} processingSize ${settingsRef.current.processingSize} candidatesToTry ${settingsRef.current.candidatesToTry}` +
        ` video ${video?.videoWidth ?? 0}x${video?.videoHeight ?? 0}`,
    );

    capturingRef.current = false;

    // Driven by the camera's own frame callback where it exists, sampling
    // every delivered frame, not the render loop's cadence.
    placementRef.current = createPlacementDetector();
    placementTallyRef.current = createPlacementTally();
    relockRef.current.reset();
    settlingRef.current = { disturbed: false, at: 0 };
    if (video && settingsRef.current.mode !== "pan") {
      const watched = video;
      // Both schedulers hand the callback a performance.now() timestamp, so
      // the watcher is clocked on the frame it's looking at, not on delay.
      const watch = (frameTime: number) => {
        if (generation !== runGenerationRef.current) {
          return;
        }
        watchPlacement(watched, frameTime);
        if (watched.requestVideoFrameCallback) {
          watched.requestVideoFrameCallback(watch);
        } else {
          requestAnimationFrame(watch);
        }
      };
      if (watched.requestVideoFrameCallback) {
        watched.requestVideoFrameCallback(watch);
      } else {
        requestAnimationFrame(watch);
      }
    }

    // Declared as a const, like the frame loop below: a hook-level function
    // referencing itself by name makes the React Compiler bail out.
    overlayTargetRef.current = null;
    overlayDrawRef.current = createDrawState();
    const paint = () => {
      if (generation !== runGenerationRef.current) {
        return;
      }
      const canvas = overlayRef.current;
      const context = canvas === null ? null : canvas.getContext("2d");
      if (canvas && context) {
        paintOverlay(canvas, context, overlayTargetRef.current, overlayDrawRef.current);
      }
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);

    // Puts the guide on screen before the first processed frame; in capture
    // mode, before the first tap.
    if (video && settingsRef.current.mode !== "pan") {
      const scale = Math.min(
        1,
        settingsRef.current.processingSize / Math.max(video.videoWidth, video.videoHeight),
      );
      updateOverlayTarget(
        null,
        gradeReticle({ hasCandidate: false, bestInliers: 0, refused: false, isWinner: false }),
        Math.round(video.videoWidth * scale),
        Math.round(video.videoHeight * scale),
        0,
        0,
        0,
        lockRunForMode(settingsRef.current.mode),
      );
    }
    if (settingsRef.current.mode === "capture") {
      // Camera on, guide drawn, pipeline idle: frames run one at a time when
      // capture() is tapped.
      startingRef.current = false;
      return;
    }

    // Declared here, not at hook level, so the loop never references a
    // hoisted function by name; the React Compiler bails out on that.
    const loop = () => {
      if (!runningRef.current) {
        return;
      }
      // Live scanning always wins the frame slot; the second look only runs
      // when the guide is quiet.
      const inFlight = shouldRunCatchUp({
        queued: catchUpQueueRef.current.size(),
        settling: settlingRef.current.disturbed,
        cardInGuide: cardInGuideRef.current,
        busy: catchUpBusyRef.current,
      })
        ? runCatchUp()
        : runFrame();
      frameInFlightRef.current = inFlight;
      const scheduleNext = () => {
        const pace = idlePaceRef.current;
        const paced =
          settingsRef.current.mode !== "pan" &&
          pace.streak >= IDLE_AFTER_NO_WINNER_FRAMES &&
          pace.lastTotalMs > IDLE_PACE_MIN_FRAME_MS;
        if (paced) {
          setTimeout(() => requestAnimationFrame(loop), IDLE_PACE_DELAY_MS);
        } else {
          requestAnimationFrame(loop);
        }
      };
      /* oxlint-disable promise/prefer-await-to-then, promise/prefer-catch -- the rAF loop is callback-shaped; a rejected frame must not kill it */
      inFlight.then(scheduleNext, (frameError: unknown) => {
        setError(errorText(frameError, "Frame processing failed"));
        scheduleNext();
      });
      /* oxlint-enable promise/prefer-await-to-then, promise/prefer-catch */
    };
    idlePaceRef.current = { streak: 0, lastTotalMs: 0 };
    aimSinceRef.current.clear();
    requestAnimationFrame(loop);
    startingRef.current = false;

    // Read last, so enumerateDevices never delays the first frame; it never
    // rejects, so needs no guard of its own.
    const info = await readCameraInfo(stream);
    if (generation === runGenerationRef.current) {
      setCameraInfo(info);
    }
  }

  /**
   * The frame shares the live session, so repeated captures of one card
   * build an agreeing run and can lock like live frames.
   */
  async function capture(): Promise<void> {
    if (!runningRef.current || capturingRef.current) {
      return;
    }
    capturingRef.current = true;
    const inFlight = runFrame();
    frameInFlightRef.current = inFlight;
    try {
      await inFlight;
    } catch (captureError) {
      setError(errorText(captureError, "Frame processing failed"));
    }
    capturingRef.current = false;
  }

  function stop() {
    runGenerationRef.current++;
    runningRef.current = false;
    capturingRef.current = false;
    setActive(false);
    aimHintSmootherRef.current.reset();
    // The bumped generation already ended the paint loop, so the canvas must
    // be cleared here and the target dropped before a restart repaints it.
    overlayTargetRef.current = null;
    const canvas = overlayRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function clearHistory() {
    locksRef.current = [];
    frameTimesRef.current = [];
    aimSinceRef.current.clear();
    setReadout({ ...EMPTY_READOUT });
  }

  return {
    videoRef,
    overlayRef,
    cvReady,
    embedderReady,
    embedMsPerImage,
    deviceTooSlow: embedMsPerImage > SLOW_DEVICE_EMBED_MS,
    engineProgress,
    active,
    error,
    readout,
    cameraInfo,
    start,
    stop,
    capture,
    identifyNow,
    clearHistory,
    unidentified: catchUpPending,
    dismissUnidentified: (id: string) => {
      setCatchUpPending((current) => current.filter((card) => card.id !== id));
    },
  };
}
