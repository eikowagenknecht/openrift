import type {
  CardCandidate,
  CardEmbedder,
  FrameOutcome,
  OpenCvLike,
  OrbCvLike,
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

import { isOverconstrainedError, scannerVideoConstraints } from "@/lib/camera-constraints";
import { cameraErrorMessage } from "@/lib/camera-error";
import type { CameraInfo } from "@/lib/camera-info";
import { readCameraInfo } from "@/lib/camera-info";
import { areaFractionOfGuide } from "@/lib/scan-aim-hint";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import { catchUpVerdict, createCatchUpQueue, shouldRunCatchUp } from "@/lib/scan-catchup";
import {
  SLOW_DEVICE_EMBED_MS,
  embedderImageSize,
  loadScanEmbedder,
  measuredEmbedMsPerImage,
} from "@/lib/scan-embedder";
import { guideRectIn, snapshotVideoRect } from "@/lib/scan-flight";
import { loadOpenCv } from "@/lib/scan-opencv";
import { ORT_WASM_PATHS } from "@/lib/scan-ort-assets";
import type { ReticleGrade } from "@/lib/scan-overlay";
import { gradeReticle, lockRingFraction } from "@/lib/scan-overlay";
import type { OverlayTarget } from "@/lib/scan-overlay-paint";
import { createDrawState, paintOverlay, syncOverlaySize } from "@/lib/scan-overlay-paint";
import type { ScanSessionPlan, ScannerMode } from "@/lib/scan-session";
import {
  createConfiguredScanSession,
  gatesForBank,
  lockRunForMode,
  scanSessionPlans,
} from "@/lib/scan-session";
import type { ScanWorkerClient } from "@/lib/scan-worker-client";
import { createScanWorkerClient } from "@/lib/scan-worker-client";
import type { ScanWorkerOutcome, SessionKind } from "@/workers/scan-worker";

export interface ScannerSettings {
  mode: ScannerMode;
  /** Long side the camera frame is scaled to before processing. */
  processingSize: number;
  /** Detector proposals rectified and embedded per frame. */
  candidatesToTry: number;
}

/**
 * The clips the engine was calibrated on are 848 pixels on the long side, so
 * that is the parity default; the rest comes from the session's calibrated
 * defaults. The processing size applies from the next processed frame;
 * candidates per frame is fixed at session creation, so it applies when the
 * camera is next started.
 */
export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  mode: "single",
  processingSize: 848,
  candidatesToTry: DEFAULT_SESSION_OPTIONS.candidatesToTry,
};

/**
 * Extra wait between guide-mode frames while the session is in idle backoff
 * AND frames are still expensive: a throttling phone gains nothing from
 * grinding aiming frames back to back — it just stays hot (measured
 * 0.8-1.7 s/frame on a hot Pixel 1, 2026-07-31). The wait applies only after
 * {@link IDLE_AFTER_NO_WINNER_FRAMES} winner-less frames and only when the
 * last frame ran over {@link IDLE_PACE_MIN_FRAME_MS}, so fast devices (and
 * cool ones) never pace; the worst case is one delayed reaction to a card
 * entering the guide.
 */
const IDLE_PACE_DELAY_MS = 300;
const IDLE_PACE_MIN_FRAME_MS = 400;

/**
 * Long side the placement watcher scales the camera frame to.
 *
 * This runs on every camera frame, not every processed one, so it has to be
 * far cheaper than the pipeline: at 128 pixels the draw and read cost a
 * fraction of a millisecond, against the tens of milliseconds a processed
 * frame costs. It only ever feeds `createPlacementDetector`, which reduces it
 * to a 16x22 thumbnail anyway.
 */
const WATCH_LONG_SIDE = 128;

/**
 * Search param that runs the pipeline in a worker instead of in the page.
 *
 * Opt-in on purpose. The move is a large one (OpenCV, the encoder and both
 * sessions all live on the other side) and the parts of it that can only fail
 * in a real browser are exactly the parts a bench cannot reach: evaluating the
 * emscripten glue without a script tag, onnxruntime inside a worker, and the
 * wasm heap on a phone. Same shape as the existing `?ortThreads` and
 * `?ortProxy` knobs, so it can be A/B'd on a phone without a rebuild.
 */
const WORKER_PARAM = "scanWorker";

/**
 * Whether this page asked for the worker pipeline.
 *
 * @returns True when `?scanWorker=1` is set and workers exist at all.
 */
function workerRequested(): boolean {
  if (typeof Worker === "undefined") {
    return false;
  }
  const params = new URLSearchParams(globalThis.location?.search ?? "");
  return params.get(WORKER_PARAM) === "1";
}

/**
 * How long a card may sit in the guide unrecognised before it counts as a
 * miss.
 *
 * Real locks land well inside this: 0.5-0.6 s upright on a healthy phone, and
 * 3.2 s was the worst measured case (a low-texture card whose frames hover at
 * the inlier floor, 2026-07-31 session log). Waiting 4 s means a slow lock is
 * never called a miss, at the cost of the warning arriving a beat late, which
 * is the right way round: a wrong "not recognised" line would send the user
 * back to a card that was in fact counted.
 */
const MISS_GRACE_MS = 4000;

/**
 * How long the watcher's "the guide is changing" verdict is trusted.
 *
 * The verdict skips pipeline frames, so a watcher that stops firing (a stalled
 * video element, a browser that hands out `requestVideoFrameCallback` and then
 * goes quiet) would otherwise freeze scanning altogether. Past this the
 * pipeline runs anyway: a wasted blurred frame costs one frame slot, a frozen
 * scanner costs the session.
 */
const SETTLE_TRUST_MS = 500;

/**
 * A gap in an artwork's top-ranked streak longer than this restarts its
 * aim-to-lock clock: the user evidently aimed away and came back, and the
 * diagnostic should time the current attempt, not the whole session.
 */
const AIM_STREAK_GAP_MS = 3000;

/**
 * The guide rect in frame coordinates: a centered portrait card outline.
 * Defined in the engine so the offline bench anchors on the same rect.
 */
const guideQuadFor = centeredGuideQuad;

/**
 * A card the placement detector watched land that nothing could identify, kept
 * with the picture of the moment it settled so the user can say what it was.
 */
export interface UnidentifiedCard {
  id: string;
  /** A small JPEG data URL of the card as it lay in the guide. */
  thumbnail: string | null;
  /** Best guesses from the second look, nearest first; may be empty. */
  candidates: { key: string; artKey: string }[];
  at: number;
}

/** A card the accept layer locked, with the numbers the phone bar is judged on. */
export interface LockedCard {
  key: string;
  artKey: string;
  label: string;
  /**
   * The disambiguation stage settled on one printing. False for foils and
   * unsplittable variants — and for every single-render artwork, where the
   * stage has nothing to run on; callers widen those to the artwork's
   * candidate printings themselves.
   */
  resolved: boolean;
  /** Wall-clock time of the lock. */
  at: number;
  /** Seconds from the start of the run of agreeing frames to the lock. */
  lockSeconds: number;
  framesToLock: number;
  inliers: number;
}

/**
 * Lock lifecycle callbacks for the scanning UI. Held in a ref, so consumers
 * may pass fresh closures every render without restarting the frame loop.
 */
export interface ScannerEvents {
  /** A new lock, after any lock-frame disambiguation ran. */
  onLock?: (lock: LockedCard) => void;
  /** A follow-up frame resolved an earlier lock's printing. */
  onLockResolved?: (update: { artKey: string; key: string; label: string }) => void;
}

/** Download state of one big engine resource, for the loading screen. */
export interface ResourceProgress {
  /** Bytes received so far. */
  loaded: number;
  /** Bytes expected, 0 when the server did not say. */
  total: number;
  /** True once the resource is fully initialised, not merely downloaded. */
  ready: boolean;
}

export interface EngineProgress {
  opencv: ResourceProgress;
  encoder: ResourceProgress;
}

const INITIAL_ENGINE_PROGRESS: EngineProgress = {
  opencv: { loaded: 0, total: 0, ready: false },
  encoder: { loaded: 0, total: 0, ready: false },
};

export interface ScannerReadout {
  /** Best detector proposal of the last processed frame. */
  candidate: CardCandidate | null;
  /** Embedding shortlist for that proposal, nearest first. */
  ranked: RankedEmbed[];
  winnerKey: string | null;
  winnerInliers: number;
  rivalInliers: number;
  /** True when the frame cleared the inlier floor but not the margin. */
  refused: boolean;
  /**
   * Highest inlier count on the last frame's verified shortlist, winner or
   * not. On a winner-less frame, values just under the 11-inlier floor mean
   * "card seen, verification barely failing" — the almost-there band the
   * hold-steady cue reads.
   */
  bestInliers: number;
  focus: number;
  /** Pipeline frames processed in the last second. */
  fps: number;
  detectMs: number;
  embedMs: number;
  verifyMs: number;
  totalMs: number;
  locks: LockedCard[];
  /**
   * The artwork the user is currently aiming at, when the top-ranked
   * candidate is at least plausible: its best bank key and how long its
   * top-ranked streak has run. Null while nothing in frame ranks plausibly.
   * This is what the page's "Is it X?" suggestion and the identify-now
   * candidates are allowed to trust — raw `ranked` entries include far
   * matches of an empty guide.
   */
  aim: { artKey: string; key: string; seconds: number } | null;
  /**
   * How far the current front-runner is through its run of agreeing frames:
   * `runLength` of the `lockRun` frames a lock needs, clamped to it. Zero
   * whenever the last frame produced no winner, so a broken run reads as lost
   * progress rather than a stuck bar. `lockRun` is 0 before the first frame of
   * a run, and 1 in capture mode, where a tap either locks or does not — the
   * overlay draws no progress ring for either.
   */
  lockProgress: { runLength: number; lockRun: number };
  /**
   * How much of the guide rect the settled candidate covers, as an area
   * ratio: about 1 when the card fills the guide, well under it when the card
   * is too far away. Computed here because the quads are in processing-frame
   * pixels and only this hook knows the frame's dimensions. Zero on a frame
   * with no candidate. Always measured against the guide rect, even in pan
   * mode, which draws none.
   */
  candidateAreaFraction: number;
  /**
   * Cards seen to land in the guide this session, counted by the placement
   * detector rather than by recognition. Every physical card that comes to
   * rest bumps this, whether or not it was identified, so the page can say
   * how many cards went past and how many of them were counted.
   */
  placements: number;
  /**
   * Placements that produced no lock: cards the user laid down and the
   * session did not count. The page turns these into something the user can
   * act on instead of a silently short number.
   */
  missedPlacements: number;
  /**
   * The guide is changing right now (a card landing, a hand passing). Frames
   * are not processed while this holds, so the page shows it rather than
   * leaving the reticle looking stuck.
   */
  settling: boolean;
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
  settling: false,
};

/**
 * Message for a thrown value.
 *
 * Kept out of the catch blocks themselves: the React Compiler cannot lower a
 * conditional inside a try/catch and bails out of the whole hook when it finds
 * one.
 *
 * @returns The error's message, or the fallback for a non-Error throw.
 */
function errorMessage(thrown: unknown, fallback: string): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return fallback;
}

/** Where the engine's downloadable assets live (from the serving manifest,
 * or the dev export fallback). Null while the manifest is still resolving —
 * the heavyweight downloads wait for it. */
export interface ScanEngineAssets {
  encoderUrl: string;
  opencvUrl: string;
  /** Bank and labels, for the worker path: it loads its own copy. */
  bankUrl?: string;
  labelsUrl?: string;
}

/**
 * Drive the camera and run every frame through the shared scan session.
 *
 * The camera preview renders at native framerate on its own; the pipeline runs
 * behind it as fast as the device allows, one frame at a time. The pipeline
 * runs in the page by default and inside a worker when `?scanWorker=1` asks
 * for it; both go through the same session configuration (`scan-session.ts`).
 *
 * @returns Refs to attach to the video and overlay elements, plus live readout and controls.
 */
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
  // Winner-less streak and last frame cost, mirroring the session's idle
  // backoff so the loop can also pace its frame rate down (see
  // IDLE_PACE_DELAY_MS). The gate ref holds the session's plausible-distance
  // bound, set where the session is created.
  const idlePaceRef = useRef({ streak: 0, lastTotalMs: 0 });
  const idleGateRef = useRef(DEFAULT_SESSION_OPTIONS.rotationFallbackDistance);
  // When each artwork's current top-ranked streak began, for the aim-to-lock
  // diagnostic: lockSeconds times only the verified run, while the user feels
  // the whole stretch from aiming to the lock buzz.
  const aimSinceRef = useRef(new Map<string, { since: number; lastSeen: number }>());
  // Quarter turns applied to grabbed frames so matching runs on upright
  // content. Android can hand over a camera buffer rotated relative to the
  // display (orientation state at track start), and users place cards
  // sideways or upside-down; both read as persistent non-zero winner
  // rotations, which cost double (the confident gate never hits, ORB inliers
  // weaken, printing disambiguation abstains). Adopted from two consecutive
  // verified winners agreeing on a rotation, so the frame converges to the
  // fast upright path per aimed card.
  const frameTurnsRef = useRef(0);
  const winnerRotationStreakRef = useRef({ rotation: 0, count: 0 });
  // A capture-mode tap in flight; further taps are ignored until it settles.
  const capturingRef = useRef(false);
  // One adoption per proof: after adopting, further adoption stays disarmed
  // until an upright (r0) winner confirms the compensation worked. Without
  // this, a card whose REFERENCE is landscape (battlefields report r1 no
  // matter how the frame is oriented) spins the frame indefinitely — each
  // spin flips the processed dimensions, thrashing the only-ever-growing
  // OpenCV heap until the tab dies (observed on a Pixel 1, 2026-07-27).
  const rotationAdoptionArmedRef = useRef(true);
  // The placement watcher: a second, far cheaper eye on the camera that runs
  // on every frame the browser delivers rather than on every frame the
  // pipeline manages to process. It is what makes repeated copies countable
  // (see packages/shared/src/scan/placement.ts).
  const watchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const placementRef = useRef<PlacementDetector | null>(null);
  const placementCountsRef = useRef({
    placements: 0,
    missed: 0,
    lockedSincePlacement: true,
    /** When the placement still waiting for a lock landed. */
    pendingSince: 0,
  });
  const settlingRef = useRef({ disturbed: false, at: 0 });
  // Whether the last processed frame had something plausible in the guide, so
  // the catch-up pass can tell "between cards" from "mid-scan".
  const cardInGuideRef = useRef(false);
  // Frames from placements nothing identified, waiting for a quiet moment.
  // The session they are replayed through is a second, never-locking one: a
  // single frame cannot earn a run, and feeding it to the live session would
  // corrupt the run of whatever card is in the guide now.
  const catchUpQueueRef = useRef(createCatchUpQueue());
  const catchUpSessionRef = useRef<ScanSession | null>(null);
  // The worker path, when this session is running one. Null means the pipeline
  // runs in the page, which is still the default (see WORKER_PARAM).
  const workerRef = useRef<ScanWorkerClient | null>(null);
  const catchUpBusyRef = useRef(false);
  const [catchUpPending, setCatchUpPending] = useState<UnidentifiedCard[]>([]);
  // The frame the last placement settled on, held until that placement either
  // produces a lock or is written off as a miss.
  const pendingFrameRef = useRef<{ frame: RgbaImage; thumbnail: string | null } | null>(null);
  const catchUpSeqRef = useRef(0);

  // The overlay's two halves: what the last processed frame decided, and the
  // eased state the animation-frame painter carries between repaints.
  const overlayTargetRef = useRef<OverlayTarget | null>(null);
  const overlayDrawRef = useRef(createDrawState());

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<ScannerReadout>(EMPTY_READOUT);
  // What the browser reported about the track the last start opened. Kept past
  // stop() on purpose: it is a snapshot, not live state, and reading it off a
  // phone is easier with the camera (and its battery drain) switched off.
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const cvRef = useRef<(OpenCvLike & OrbCvLike) | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const embedderRef = useRef<CardEmbedder | null>(null);
  const [embedderReady, setEmbedderReady] = useState(false);
  // The init self-bench's per-image encoder cost, for the too-slow notice.
  const [embedMsPerImage, setEmbedMsPerImage] = useState(0);
  const [engineProgress, setEngineProgress] = useState<EngineProgress>(INITIAL_ENGINE_PROGRESS);

  // Primitive deps: the assets object's identity is render-derived, and an
  // identity change mid-download would run the cleanup and orphan the load.
  const opencvUrl = assets?.opencvUrl ?? null;
  const encoderUrl = assets?.encoderUrl ?? null;

  // The worker owns the engine when this page asked for it: one loader, on the
  // other side, instead of two here. Everything the page still needs from the
  // engine (readiness, the encoder's measured cost) comes back over messages.
  const bankUrl = assets?.bankUrl ?? null;
  const labelsUrl = assets?.labelsUrl ?? null;
  useEffect(() => {
    if (
      !workerRequested() ||
      workerRef.current ||
      opencvUrl === null ||
      encoderUrl === null ||
      bankUrl === null ||
      labelsUrl === null
    ) {
      return;
    }
    let client: ScanWorkerClient | null = null;
    let cancelled = false;
    try {
      client = createScanWorkerClient((asset, loadedBytes, totalBytes) => {
        if (!cancelled) {
          setEngineProgress((previous) => ({
            ...previous,
            [asset]: { loaded: loadedBytes, total: totalBytes, ready: false },
          }));
        }
      });
    } catch (workerError) {
      // The page keeps its in-page path: a browser that will not make the
      // worker still scans, it just scans on the main thread.
      console.log(`[scan] worker unavailable, staying in-page: ${String(workerError)}`);
      return;
    }
    workerRef.current = client;
    const started = client;
    async function init(): Promise<void> {
      try {
        const ready = await started.init({
          opencvUrl: opencvUrl as string,
          encoderUrl: encoderUrl as string,
          bankUrl: bankUrl as string,
          labelsUrl: labelsUrl as string,
        });
        if (cancelled) {
          return;
        }
        console.log(
          `[scan] worker ready: ${ready.embedMsPerImage.toFixed(0)}ms/image, input ${ready.embedImageSize}`,
        );
        setEmbedMsPerImage(ready.embedMsPerImage);
        setCvReady(true);
        setEmbedderReady(true);
        setEngineProgress((previous) => ({
          opencv: { ...previous.opencv, ready: true },
          encoder: { ...previous.encoder, ready: true },
        }));
      } catch (initError) {
        if (cancelled) {
          return;
        }
        // Falling back mid-session would mean downloading everything again on
        // the main thread; saying so plainly beats a silent half-speed page.
        workerRef.current = null;
        started.terminate();
        setError(errorMessage(initError, "The scanning engine failed to start"));
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [opencvUrl, encoderUrl, bankUrl, labelsUrl]);

  // Loaded only when asked for, and only on this route: the build is around ten
  // megabytes, which has no business in the main bundle.
  useEffect(() => {
    if (workerRequested() || cvRef.current || opencvUrl === null) {
      return;
    }
    const url = opencvUrl;
    let cancelled = false;
    async function loadCv(): Promise<void> {
      let cv: (OpenCvLike & OrbCvLike) | null = null;
      let message: string | null = null;
      try {
        cv = await loadOpenCv(url, (loadedBytes, totalBytes) => {
          if (!cancelled) {
            setEngineProgress((previous) => ({
              ...previous,
              opencv: { loaded: loadedBytes, total: totalBytes, ready: false },
            }));
          }
        });
      } catch (loadError) {
        message = errorMessage(loadError, "Could not load OpenCV");
      }
      if (cancelled) {
        return;
      }
      if (cv) {
        cvRef.current = cv;
        setCvReady(true);
        setEngineProgress((previous) => ({
          ...previous,
          opencv: { ...previous.opencv, ready: true },
        }));
      }
      if (message !== null) {
        setError(message);
      }
    }
    void loadCv();
    return () => {
      cancelled = true;
    };
  }, [opencvUrl]);

  // The encoder download starts as soon as the manifest names it rather than
  // on the first Start press — it is the biggest asset.
  useEffect(() => {
    if (workerRequested() || embedderRef.current || encoderUrl === null) {
      return;
    }
    const url = encoderUrl;
    let cancelled = false;
    async function loadEncoder(): Promise<void> {
      let embedder: CardEmbedder | null = null;
      let message: string | null = null;
      try {
        embedder = await loadScanEmbedder(url, ORT_WASM_PATHS, (loadedBytes, totalBytes) => {
          if (!cancelled) {
            setEngineProgress((previous) => ({
              ...previous,
              encoder: { loaded: loadedBytes, total: totalBytes, ready: false },
            }));
          }
        });
      } catch (loadError) {
        message = errorMessage(loadError, "Could not load the encoder model");
      }
      if (cancelled) {
        return;
      }
      if (embedder) {
        embedderRef.current = embedder;
        setEmbedMsPerImage(measuredEmbedMsPerImage());
        setEmbedderReady(true);
        setEngineProgress((previous) => ({
          ...previous,
          encoder: { ...previous.encoder, ready: true },
        }));
      }
      if (message !== null) {
        setError(message);
      }
    }
    void loadEncoder();
    return () => {
      cancelled = true;
    };
  }, [encoderUrl]);

  // The overlay canvas follows the video's box, which changes on rotation and
  // on any layout shift. Handled here rather than in the paint loop: measuring
  // the video every animation frame is exactly the layout thrash the split
  // between pipeline cadence and paint cadence exists to avoid.
  useEffect(() => {
    const resize = () => {
      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        syncOverlaySize(canvas, video);
      }
      // Resizing a canvas clears it, and the new box maps the same frame to
      // different pixels: the painter has to redraw, and the reticle snaps to
      // the new mapping rather than sliding across the screen.
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

  // Mirrored into a ref so the frame loop always reads current settings without
  // being torn down and restarted. Writing it in an effect rather than during
  // render keeps the React Compiler from bailing out of the whole hook.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Same treatment for the lock callbacks: consumers pass fresh closures per
  // render, and the loop must always call the latest without restarting.
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // When the page goes away: stop the camera (or it stays on after
  // navigating elsewhere) and release the session's OpenCV allocations after
  // any in-flight frame has finished with them.
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
      const worker = workerRef.current;
      sessionRef.current = null;
      catchUpSessionRef.current = null;
      workerRef.current = null;
      worker?.terminate();
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
   * Plan both sessions for the run that is starting.
   *
   * Shared by the in-page and the worker path: the plan is plain data, so the
   * worker rebuilds the identical pair on its own side from the same
   * description (see `scan-session.ts`).
   *
   * @param embedMs Measured per-image encoder cost on whichever thread owns
   *   the encoder, which decides the slow-device profile.
   * @returns The plans, or null before the bank has loaded.
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

  /**
   * Build the live pass and the catch-up pass in the page.
   *
   * @returns Both sessions, or null before the engine has loaded.
   */
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

  /**
   * Grab the current video frame, scaled to the processing size and rotated
   * by the adopted quarter turns so the engine sees upright content.
   *
   * @returns The frame, or null while the video has no dimensions.
   */
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
   * Fold one camera frame into the placement detector.
   *
   * Deliberately independent of the pipeline: a card dealt onto a pile is in
   * motion for a third of a second and at rest for a second, and a phone that
   * processes five frames a second can easily spend that whole second inside
   * two frames. Sampling the change signal at camera rate is what turns "the
   * pile looks the same as it did" into "a card just landed".
   *
   * @returns Nothing; the detector's state and the session are updated.
   */
  function watchPlacement(video: HTMLVideoElement): void {
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
    // The watcher runs in the camera's own frame; the pipeline's rotation
    // compensation does not apply and does not matter, since the detector
    // only ever compares one frame against the previous one.
    const signal = detector.observe(
      toGray({ data: pixels.data, width, height }),
      guideQuadFor(width, height),
    );
    const counts = placementCountsRef.current;
    // A card that came to rest and was never identified is counted here rather
    // than when the next one arrives, so the last card of a session is not
    // silently forgiven.
    const now = performance.now();
    settlingRef.current = { disturbed: signal.disturbed, at: now };
    if (!counts.lockedSincePlacement && now - counts.pendingSince > MISS_GRACE_MS) {
      counts.missed++;
      counts.lockedSincePlacement = true;
      // The card is gone from the guide by now, but the frame it settled on is
      // still here. Recognising it costs a frame slot the live pass did not
      // have and now does.
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
    counts.placements++;
    counts.lockedSincePlacement = false;
    counts.pendingSince = now;
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

  /**
   * Adopt a frame rotation when verified winners persistently report one.
   *
   * @returns Nothing; the adopted turns apply from the next grabbed frame.
   */
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
   * Hand the last processed frame to the paint loop. Nothing is drawn here:
   * the pipeline lands 5-15 times a second, far too rarely for its own cadence
   * to look like tracking, so the animation-frame painter owns the canvas and
   * this only ever updates what it is aiming at.
   *
   * @returns Nothing; the target is stored for the paint loop.
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
    // The one layout read of the overlay path, deliberately on the pipeline's
    // cadence rather than the painter's.
    syncOverlaySize(canvas, video);
    overlayTargetRef.current = {
      quad: candidate?.quad ?? null,
      guide: settingsRef.current.mode === "pan" ? null : guideQuadFor(frameWidth, frameHeight),
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

    // Publishing on every frame would re-render the readout for no benefit; the
    // numbers are unreadable faster than this anyway. A lock publishes
    // immediately so it never feels delayed.
    if (!force && now - lastPublishRef.current < 150) {
      return;
    }
    lastPublishRef.current = now;
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
      placements: placementCountsRef.current.placements,
      missedPlacements: placementCountsRef.current.missed,
      settling: settlingRef.current.disturbed,
    });
  }

  function noteLock(outcome: FrameOutcome) {
    const track = outcome.locked;
    if (!track) {
      return;
    }
    // A capture-mode lock comes from exactly one deliberate tap, so elapsed
    // run time is always 0.00s; the number that means something there is how
    // long the tap took to process.
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
    // This placement produced a card, so it is not one of the misses and its
    // held frame has nothing left to prove.
    placementCountsRef.current.lockedSincePlacement = true;
    pendingFrameRef.current = null;
    // Wall time since this artwork's top-ranked streak began — the number the
    // user actually experiences, unlike lockSeconds which starts at the first
    // VERIFIED frame and hides any seen-but-unverifiable stretch before it.
    const aimed = aimSinceRef.current.get(track.artKey);
    const aimSeconds = aimed ? (performance.now() - aimed.since) / 1000 : null;
    aimSinceRef.current.delete(track.artKey);
    const aimPart = aimSeconds === null ? "" : `, aim-to-lock ${aimSeconds.toFixed(2)}s`;
    console.log(
      `[scan] LOCK ${track.label} (${track.key}) after ${framesToLock} frames, ${lockSeconds.toFixed(2)}s${aimPart}`,
    );
    // A short buzz marks the lock moment, so on a phone the eyes can stay on
    // the cards instead of the lock list.
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
   * Run one frame through whichever engine this session is using.
   *
   * The worker path owns the sessions and answers with the run state the
   * overlay needs; the in-page path reads it off the session it holds. Frames
   * handed to the worker are transferred, so the buffer must not be touched
   * after this call either way.
   *
   * @returns The frame's outcome and the winning artwork's run, or null when
   *   there is no engine to run it on.
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

  /**
   * Let locked cards lock again, on whichever engine is running.
   *
   * @returns Nothing.
   */
  function rearmEngine(): void {
    if (workerRef.current) {
      workerRef.current.rearm();
      return;
    }
    sessionRef.current?.rearm();
  }

  /**
   * Give one queued frame a second look.
   *
   * Runs through its own session so the live one's runs stay intact, and that
   * session never locks: a lone frame has no run behind it, so the decision is
   * made here from the frame's own evidence (see `catchUpVerdict`). A card the
   * frame proves outright is reported as a lock, exactly as if the live pass
   * had caught it; anything weaker becomes a card the user can identify, with
   * the picture attached.
   *
   * @returns Nothing; the result is reported through the lock event or the
   *   unidentified list.
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
      // A failed second look is not worth surfacing: the card is already
      // counted as a miss, and the live pass must not be interrupted.
      console.log(`[scan] catch-up failed: ${errorMessage(catchUpError, "unknown")}`);
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
    const seen = new Set<string>();
    const candidates: UnidentifiedCard["candidates"] = [];
    for (const ranked of outcome.ranked) {
      const artKey = loaded?.artKeys.get(ranked.key) ?? ranked.key;
      if (seen.has(artKey)) {
        continue;
      }
      seen.add(artKey);
      candidates.push({ key: ranked.key, artKey });
    }
    setCatchUpPending((current) => [
      ...current,
      {
        id: entry.id,
        thumbnail: entry.thumbnail,
        candidates: candidates.slice(0, 4),
        at: entry.at,
      },
    ]);
  }

  async function runFrame(): Promise<void> {
    const video = videoRef.current;
    if (!video || (!sessionRef.current && !workerRef.current)) {
      return;
    }
    // Mid-swap frames are motion-blurred, half-occluded, or showing two cards
    // at once. Nothing good comes of recognising them, and on a phone a frame
    // slot is the scarcest resource there is, so the watcher's verdict decides
    // whether this one is worth the pipeline. Capture mode is exempt: a tap
    // is a deliberate shot and must always run.
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

    // Same reset rule as the session's idle backoff: a verified winner or a
    // plausible ranking ends the streak, so pacing lifts on the same frame
    // the full search returns.
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
    // The aim age exposes the streak the LOCK line's aim-to-lock is read
    // from; a lock reporting less than the ages printed just before it means
    // the streak was lost, and the frame it reset on names the cause.
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

    // How far the frame's winner is through the run it needs to lock. Read off
    // the accept layer's own track, so the ring can only ever show what the
    // session would actually lock on; a winner-less frame is no progress at
    // all, and the ring bleeds back down.
    const lockRun = lockRunForMode(settingsRef.current.mode);
    // Weighted runs are what the accept layer scores, so the ring follows the
    // same number: a run of two strong frames is genuinely further along than
    // two marginal ones, and the ring should say so.
    const runLength = result.run ? Math.min(result.run.weight, lockRun) : 0;

    const grade = gradeReticle({
      hasCandidate: outcome.candidate !== null,
      bestInliers: outcome.bestInliers,
      refused: outcome.refused,
      isWinner: outcome.winner !== null,
    });
    // How much of the guide the settled candidate fills — the framing signal
    // the page coaches from. Measured on the same candidate the reticle
    // grades, and in the same frame coordinates the quads live in, which is
    // why it cannot be derived outside this hook.
    const areaFraction =
      outcome.candidate === null
        ? 0
        : areaFractionOfGuide(outcome.candidate.quad, guideQuadFor(frame.width, frame.height));
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
    // The Start button stays enabled until the camera opens, so a double tap
    // would otherwise drive one non-reentrant session from two loops and leak
    // the first call's stream.
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

    // Built before the try block, because the try blocks hold nothing but the
    // awaited call: the React Compiler bails out of the whole hook on a
    // `finally` clause or on conditionals and loops inside try/catch, so all
    // control flow lives between them and the starting flag is cleared on
    // every exit path by hand.
    const capFrameRate = measuredEmbedMsPerImage() > SLOW_DEVICE_EMBED_MS;
    let stream: MediaStream | null = null;
    let cameraFailure: unknown = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: scannerVideoConstraints(capFrameRate),
      });
    } catch (cameraError) {
      cameraFailure = cameraError;
    }

    // The frame rate cap is a hard max, so a camera whose only mode runs above
    // it would refuse to open at all — on exactly the slow devices the cap is
    // meant to help. Retrying uncapped costs one extra call in a case that
    // should never happen, and turns a dead camera into a merely hot one.
    if (stream === null && capFrameRate && isOverconstrainedError(cameraFailure)) {
      console.log("[scan] no camera mode under the frame rate cap, retrying uncapped");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: scannerVideoConstraints(false),
        });
      } catch (retryError) {
        cameraFailure = retryError;
      }
    }

    if (stream === null) {
      setError(cameraErrorMessage(cameraFailure, "Could not open the camera"));
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
        playFailure = errorMessage(playError, "Could not start the camera preview");
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

    // The placement watcher runs for the whole session, in both guide modes:
    // the live session counts copies from it, and capture mode uses it to know
    // when the card under the lens has changed. Driven by the camera's own
    // frame callback where that exists, so it samples every delivered frame
    // rather than whatever the render loop happens to line up with.
    placementRef.current = createPlacementDetector();
    placementCountsRef.current = {
      placements: 0,
      missed: 0,
      lockedSincePlacement: true,
      pendingSince: 0,
    };
    settlingRef.current = { disturbed: false, at: 0 };
    if (video && settingsRef.current.mode !== "pan") {
      const watched = video;
      const watch = () => {
        if (generation !== runGenerationRef.current) {
          return;
        }
        watchPlacement(watched);
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

    // The overlay repaints every animation frame for as long as this run
    // lasts, easing the drawn corners toward whatever the last processed frame
    // decided. Declared as a const for the same reason as the frame loop
    // below: a hook-level function that references itself by name makes the
    // React Compiler bail out of the whole hook. The generation check is what
    // keeps a stopped run's painter from surviving into the next one.
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

    // Put the guide on screen before the first processed frame lands — in
    // capture mode that is until the first tap, which would otherwise face a
    // bare camera preview.
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

    // Declared here rather than at hook level so the loop never references a
    // hoisted function by name; the React Compiler cannot rewrite that and
    // bails out of the entire hook when it sees one.
    const loop = () => {
      if (!runningRef.current) {
        return;
      }
      // A quiet guide is when the second look is free: live scanning always
      // wins the frame slot, since the card in front of the camera now is the
      // one the user is waiting on.
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
        setError(errorMessage(frameError, "Frame processing failed"));
        scheduleNext();
      });
      /* oxlint-enable promise/prefer-await-to-then, promise/prefer-catch */
    };
    idlePaceRef.current = { streak: 0, lastTotalMs: 0 };
    aimSinceRef.current.clear();
    requestAnimationFrame(loop);
    startingRef.current = false;

    // Read last, so enumerateDevices never delays the first frame. Only
    // meaningful once the track is producing: width and height read as 0
    // before then, and device labels stay empty until the camera permission
    // this stream just obtained. Never rejects, so it needs no guard of its
    // own, and the loop is already running so an early return is safe here.
    const info = await readCameraInfo(stream);
    if (generation === runGenerationRef.current) {
      setCameraInfo(info);
    }
  }

  /**
   * Capture-mode trigger: run exactly one frame through the pipeline. The
   * frame shares the live session, so repeated captures of one card build an
   * agreeing run and can lock, exactly like live frames.
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
      setError(errorMessage(captureError, "Frame processing failed"));
    }
    capturingRef.current = false;
  }

  function stop() {
    runGenerationRef.current++;
    runningRef.current = false;
    capturingRef.current = false;
    setActive(false);
    // The bumped generation has already ended the paint loop, so the canvas
    // has to be cleared here; dropping the target keeps a restart from
    // painting the old run's geometry before its first frame lands.
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
    /** Measured per-image encoder cost; 0 until the encoder has loaded. */
    embedMsPerImage,
    /** True when live locks are predicted to take over ~2 s on this device. */
    deviceTooSlow: embedMsPerImage > SLOW_DEVICE_EMBED_MS,
    engineProgress,
    active,
    error,
    readout,
    /** What the browser reported about the last opened camera track. */
    cameraInfo,
    start,
    stop,
    capture,
    clearHistory,
    /**
     * Cards the placement watcher saw land that neither the live pass nor the
     * second look could name. Each carries the picture of the moment it
     * settled and the best guesses, for the page to offer as a pick.
     */
    unidentified: catchUpPending,
    /** Forget one unidentified card, once the user has answered or dismissed it. */
    dismissUnidentified: (id: string) => {
      setCatchUpPending((current) => current.filter((card) => card.id !== id));
    },
  };
}
