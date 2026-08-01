import { imageUrl } from "@openrift/shared";
import type {
  CardCandidate,
  CardEmbedder,
  FrameOutcome,
  OpenCvLike,
  OrbCvLike,
  Quad,
  RankedEmbed,
  RgbaImage,
  ScanSession,
} from "@openrift/shared/scan";
import {
  CARD_ASPECT,
  DEFAULT_SESSION_OPTIONS,
  IDLE_AFTER_NO_WINNER_FRAMES,
  createScanSession,
  gatesForEmbedDim,
} from "@openrift/shared/scan";
import { useEffect, useRef, useState } from "react";

import { cameraErrorMessage } from "@/lib/camera-error";
import { fetchWithProgress } from "@/lib/fetch-progress";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import {
  SLOW_DEVICE_EMBED_MS,
  embedderImageSize,
  loadScanEmbedder,
  measuredEmbedMsPerImage,
} from "@/lib/scan-embedder";

/**
 * `single` asks the user to place one card in a drawn guide rect: detection is
 * anchored to the guide, junk elsewhere in frame is ignored, and the
 * verification shortlist is trimmed. `capture` is the same framing but the
 * pipeline only runs when `capture()` is tapped — one inference per shot, for
 * devices too slow to scan continuously. `pan` is the free-form mode for
 * panning over a binder page or spread-out cards.
 */
type ScannerMode = "single" | "capture" | "pan";

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
 * Shortlist caps applied on top of the per-encoder `gates.topK` (which is the
 * real default — 2 for the custom encoder, 8 for MobileCLIP; see
 * `gatesForEmbedDim`). They only bite for encoders whose gates ask for more:
 * single-card mode never needs a deep rival list, and on slow silicon each
 * shortlist entry is a full ORB match, the dominant per-frame cost.
 */
const SINGLE_MODE_TOP_K = 4;
const SLOW_DEVICE_TOP_K = 2;

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
 * A gap in an artwork's top-ranked streak longer than this restarts its
 * aim-to-lock clock: the user evidently aimed away and came back, and the
 * diagnostic should time the current attempt, not the whole session.
 */
const AIM_STREAK_GAP_MS = 3000;

/**
 * The guide rect in frame coordinates: a centered portrait card outline.
 *
 * @returns The quad, clockwise from the top-left corner.
 */
function guideQuadFor(width: number, height: number): Quad {
  let cardHeight = 0.7 * height;
  let cardWidth = cardHeight * CARD_ASPECT;
  if (cardWidth > 0.9 * width) {
    cardWidth = 0.9 * width;
    cardHeight = cardWidth / CARD_ASPECT;
  }
  const left = (width - cardWidth) / 2;
  const top = (height - cardHeight) / 2;
  return [
    { x: left, y: top },
    { x: left + cardWidth, y: top },
    { x: left + cardWidth, y: top + cardHeight },
    { x: left, y: top + cardHeight },
  ];
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
};

/**
 * Outline a detected card on a 2D context.
 *
 * @returns Nothing; the context is drawn on directly.
 */
function strokeQuad(
  context: CanvasRenderingContext2D,
  quad: Quad | undefined,
  color: string,
  dashed = false,
): void {
  if (!quad) {
    return;
  }
  context.beginPath();
  for (const [i, point] of quad.entries()) {
    if (i === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }
  context.closePath();
  context.lineWidth = 3;
  context.strokeStyle = color;
  // The dashed stroke is the debug view: an unverified detector guess, drawn
  // so the pipeline's search is visible but clearly not a recognised card.
  context.setLineDash(dashed ? [8, 6] : []);
  context.stroke();
  context.setLineDash([]);
}

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

let cvCached: Promise<OpenCvLike & OrbCvLike> | null = null;
// Single slot, latest caller wins — same reasoning as the encoder's listener.
let cvProgressListener: ((loaded: number, total: number) => void) | null = null;

/**
 * Load the OpenCV WASM build, once per page.
 *
 * Loaded as a plain classic script (`/scan-opencv.js`, written next to the
 * bank by `export-index.ts`), NOT as a module import: vite's dep-optimized
 * ESM wrapping of the emscripten UMD spins the main thread forever during
 * evaluation, in every engine tested, while the raw script evaluates in well
 * under a second. Fetched to a blob first so the download can report
 * progress; a script tag exposes none. Kept at module level because the React
 * Compiler cannot lower a dynamic loader inside a hook.
 *
 * The custom trimmed build (scripts/scan/build-opencv.sh) splits the glue
 * from the wasm so browsers can cache the compiled machine code. The glue
 * resolves the wasm relative to its script URL — a blob: URL here — so a
 * `locateFile` override on the global `Module` (captured synchronously at
 * script evaluation) points it at the real file, which by convention sits
 * next to the .js with the same name and a .wasm extension. A single-file
 * build (the pre-trim serving) never consults `locateFile`, so the override
 * is compatible with both.
 *
 * @returns The initialised OpenCV module.
 */
async function loadOpenCv(
  scriptUrl: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<OpenCvLike & OrbCvLike> {
  if (onProgress) {
    cvProgressListener = onProgress;
  }
  /* oxlint-disable promise/prefer-catch, promise/always-return, promise/avoid-new -- adapting a script tag and a foreign thenable; every path settles */
  cvCached ??= (async () => {
    const source = await fetchWithProgress(
      scriptUrl,
      (loaded, total) => cvProgressListener?.(loaded, total),
      `could not load OpenCV from ${scriptUrl} (in dev, run: bun scripts/scan/export-index.ts)`,
    );
    const wasmUrl = scriptUrl.replace(/\.js$/u, ".wasm");
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const globalScope = globalThis as { Module?: unknown };
    const previousModule = globalScope.Module;
    globalScope.Module = {
      locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file),
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener(
          "error",
          () => reject(new Error("The OpenCV script failed to evaluate")),
          { once: true },
        );
        document.head.append(script);
      });
    } finally {
      URL.revokeObjectURL(url);
      // The factory captured the Module object during evaluation; the global
      // slot can be handed back before the wasm finishes initialising.
      globalScope.Module = previousModule;
    }
    // The emscripten export is a thenable rather than a real promise, and it
    // must never be resolved through a promise as-is: promise adoption calls
    // its `then` again with the same thenable, forever, which starves the
    // microtask queue. Stripping `then` inside the callback turns it into a
    // plain object every later await can hold safely.
    return await new Promise<OpenCvLike & OrbCvLike>((resolve, reject) => {
      (
        (globalThis as { cv?: unknown }).cv as {
          then: (
            fn: (value: OpenCvLike & OrbCvLike) => void,
            onError: (error: unknown) => void,
          ) => void;
        }
      ).then((cv) => {
        delete (cv as { then?: unknown }).then;
        resolve(cv);
      }, reject);
    });
  })();
  /* oxlint-enable promise/prefer-catch, promise/always-return, promise/avoid-new */
  try {
    return await cvCached;
  } catch (error) {
    // A failed download must not poison the page until reload: clear the slot
    // so the next mount retries.
    cvCached = null;
    throw error;
  }
}

// Reused across reference fetches; a new canvas per card would churn memory.
let referenceCanvas: HTMLCanvasElement | null = null;

/**
 * Fetch a reference render for feature verification.
 *
 * Transparent rounded corners are flattened onto mid grey, matching how the
 * bank references were decoded in the bench; a hard white or black corner
 * would inject an edge no photograph shows.
 *
 * Throws on transient failures (network errors, server errors): the session
 * caches null as "definitively missing" for its whole lifetime, and a cached
 * transient miss would silently remove the rival that refuses a wrong winner,
 * on every frame until restart.
 *
 * @returns The decoded render, or null when the render does not exist.
 */
async function fetchReference(key: string): Promise<RgbaImage | null> {
  const response = await fetch(imageUrl(key, "400w"));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`reference fetch failed with status ${response.status}`);
  }
  const blob = await response.blob();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // An undecodable asset will not improve on retry.
    return null;
  }
  if (!referenceCanvas) {
    referenceCanvas = document.createElement("canvas");
  }
  const canvas = referenceCanvas;
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return null;
  }
  context.fillStyle = "rgb(128, 128, 128)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: data.data, width: canvas.width, height: canvas.height };
}

/**
 * Drive the camera and run every frame through the shared scan session.
 *
 * The camera preview renders at native framerate on its own; the pipeline runs
 * behind it as fast as the device allows, one frame at a time. The loop stays
 * on the main thread for now — if the phone struggles it is already isolated
 * here and can move into a worker without touching the engine.
 *
 * @returns Refs to attach to the video and overlay elements, plus live readout and controls.
 */
/** Where the engine's downloadable assets live (from the serving manifest,
 * or the dev export fallback). Null while the manifest is still resolving —
 * the heavyweight downloads wait for it. */
export interface ScanEngineAssets {
  encoderUrl: string;
  opencvUrl: string;
}

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

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<ScannerReadout>(EMPTY_READOUT);
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

  // Loaded only when asked for, and only on this route: the build is around ten
  // megabytes, which has no business in the main bundle.
  useEffect(() => {
    if (cvRef.current || opencvUrl === null) {
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
    if (embedderRef.current || encoderUrl === null) {
      return;
    }
    const url = encoderUrl;
    let cancelled = false;
    async function loadEncoder(): Promise<void> {
      let embedder: CardEmbedder | null = null;
      let message: string | null = null;
      try {
        embedder = await loadScanEmbedder(url, (loadedBytes, totalBytes) => {
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
      sessionRef.current = null;
      // oxlint-disable-next-line promise/prefer-await-to-then -- a cleanup cannot await
      void Promise.resolve(inFlight).then(() => session?.release());
    },
    [],
  );

  function createSession(): ScanSession | null {
    const cv = cvRef.current;
    const embedder = embedderRef.current;
    if (!cv || !embedder || !loaded) {
      return null;
    }
    // Slow-device profile, from the encoder self-bench (a Pixel 1 measures
    // ~700 ms/image where an iPhone measures ~85): in guide mode every
    // candidate is a crop of the same physical card, so trying 4 candidates
    // and speculative rotation fallbacks means seconds of encoder time per
    // frame on such a device. Two candidate tries and a fallback bound that
    // only clearly-sideways content (~0.45+ upright) crosses keep the
    // marginal-frame cost at one or two encoder passes. Pan mode and fast
    // devices keep the clip-calibrated defaults.
    const slowDevice = measuredEmbedMsPerImage() > SLOW_DEVICE_EMBED_MS;
    // Capture mode shares the guide-anchored session; it only differs in who
    // drives the frames.
    const single = settingsRef.current.mode !== "pan";
    if (slowDevice) {
      console.log(`[scan] slow-device profile (${measuredEmbedMsPerImage().toFixed(0)}ms/image)`);
    }
    // Distance gates are calibrated per encoder; the served bank's dimension
    // says which encoder produced it.
    const gates = gatesForEmbedDim(
      loaded.bank.keys.length > 0 ? loaded.bank.vectors.length / loaded.bank.keys.length : 0,
    );
    idleGateRef.current = gates.rotationFallbackDistance;
    return createScanSession(
      {
        cv,
        embedder,
        bank: loaded.bank,
        artKeyOf: (key) => loaded.artKeys.get(key) ?? key,
        labelOf: (key) => describeKey(loaded.labels, key),
        cardTypeOf: (key) => loaded.labels[key]?.type,
        publicCodeOf: (key) => loaded.labels[key]?.code,
        markersOf: (key) => loaded.labels[key]?.markers ?? undefined,
        languageOf: (key) => loaded.labels[key]?.language,
        embedImageSize: embedderImageSize(),
        fetchReference,
      },
      {
        // One try on slow devices: in guide mode the top-ordered candidate is
        // the aimed card on nearly every frame, and each extra try is a full
        // single-image inference (measured 3.5 s hot on a Pixel 1).
        candidatesToTry:
          slowDevice && single
            ? Math.min(1, settingsRef.current.candidatesToTry)
            : settingsRef.current.candidatesToTry,
        confidentDistance: gates.confidentDistance,
        rotationFallbackDistance: gates.rotationFallbackDistance,
        topK: single
          ? Math.min(gates.topK, slowDevice ? SLOW_DEVICE_TOP_K : SINGLE_MODE_TOP_K)
          : gates.topK,
        // Guide-mode pair-only rotation search, only when the served bank was
        // built in the canonical frame: a battlefield placed in the guide then
        // matches at 0 or 180 degrees, so discovery costs at most 2 encoder
        // passes instead of 4 (the difference between ~2 s and ~10 s per tap
        // on a Pixel-1-class device). Pan keeps the full search: steep
        // foreshortening can flip a card's projected aspect into the other
        // pair (measured on the battlefields clip, 2026-07-30).
        rotationPairOnly: single && loaded.canonical,
        ...(single
          ? {
              guideFor: guideQuadFor,
              // One card by premise and ORB margin still gates every frame; a
              // 3-frame run shaves ~200 ms off each lock. Pan keeps the
              // clip-calibrated 4 (a 3-frame burst once false-locked there).
              // Capture mode locks on a single verified tap: each tap is a
              // deliberate aimed shot, the inlier floor and rival margin
              // still gate it, and a wrong tap is retaken — requiring three
              // taps per card would defeat the mode.
              accept: {
                ...DEFAULT_SESSION_OPTIONS.accept,
                lockRun: settingsRef.current.mode === "capture" ? 1 : 3,
              },
              ...(slowDevice
                ? { rotationFallbackDistance: gates.slowRotationFallbackDistance }
                : {}),
            }
          : {}),
      },
    );
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
   * Map a point from rotated-frame coordinates back to the unrotated frame
   * the video element displays.
   *
   * @returns The point in display-frame coordinates.
   */
  function unrotatePoint(
    point: { x: number; y: number },
    rotatedWidth: number,
    rotatedHeight: number,
    turns: number,
  ): { x: number; y: number } {
    if (turns === 1) {
      return { x: point.y, y: rotatedWidth - point.x };
    }
    if (turns === 2) {
      return { x: rotatedWidth - point.x, y: rotatedHeight - point.y };
    }
    if (turns === 3) {
      return { x: rotatedHeight - point.y, y: point.x };
    }
    return point;
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

  function drawOverlay(
    candidate: CardCandidate | null,
    color: string,
    frameWidth: number,
    frameHeight: number,
    turns: number,
    dashed = false,
  ) {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }
    const rect = video.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);

    // The video is rendered with object-fit: cover, so the displayed area is a
    // centre crop of the frame; the overlay has to match that mapping or the
    // outline drifts away from the card. Quads live in rotated-frame
    // coordinates, so they map back through the frame rotation first.
    const displayWidth = turns % 2 === 1 ? frameHeight : frameWidth;
    const displayHeight = turns % 2 === 1 ? frameWidth : frameHeight;
    const scale = Math.max(canvas.width / displayWidth, canvas.height / displayHeight);
    const offsetX = (canvas.width - displayWidth * scale) / 2;
    const offsetY = (canvas.height - displayHeight * scale) / 2;
    const mapped = (quad: Quad) =>
      quad.map((point) => {
        const display = unrotatePoint(point, frameWidth, frameHeight, turns);
        return {
          x: display.x * scale + offsetX,
          y: display.y * scale + offsetY,
        };
      }) as unknown as Quad;

    if (settingsRef.current.mode !== "pan") {
      strokeQuad(context, mapped(guideQuadFor(frameWidth, frameHeight)), "rgba(255,255,255,0.6)");
    }
    if (!candidate) {
      return;
    }
    strokeQuad(context, mapped(candidate.quad), color, dashed);
  }

  function publish(outcome: FrameOutcome, force: boolean) {
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

  async function runFrame(): Promise<void> {
    const video = videoRef.current;
    const session = sessionRef.current;
    if (!video || !session) {
      return;
    }
    const turns = frameTurnsRef.current;
    const frame = grabFrame(video, turns);
    if (!frame) {
      return;
    }

    const generation = runGenerationRef.current;
    const outcome = await session.processFrame(
      frame,
      frameIndexRef.current++,
      (performance.now() - sessionStartRef.current) / 1000,
      () => performance.now(),
    );
    if (generation !== runGenerationRef.current) {
      // Stop was pressed while this frame was in flight; a stale outcome must
      // not repaint the overlay or report a lock into the stopped run.
      return;
    }

    const rankedTop = outcome.ranked[0];
    let aimAgeSeconds = 0;
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

    const color = outcome.winner
      ? "rgba(74, 222, 128, 0.95)"
      : outcome.refused
        ? "rgba(251, 191, 36, 0.95)"
        : "rgba(148, 163, 184, 0.9)";
    drawOverlay(
      outcome.candidate,
      color,
      frame.width,
      frame.height,
      turns,
      outcome.winner === null && !outcome.refused,
    );
    publish(outcome, outcome.locked !== null);
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
    sessionRef.current = createSession();
    if (!sessionRef.current) {
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

    // The try blocks hold nothing but the awaited call: the React Compiler
    // bails out of the whole hook on a `finally` clause or on conditionals and
    // loops inside try/catch, so all control flow lives between them and the
    // starting flag is cleared on every exit path by hand.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch (cameraError) {
      setError(cameraErrorMessage(cameraError, "Could not open the camera"));
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
    if (settingsRef.current.mode === "capture" && video) {
      // Camera on, guide drawn, pipeline idle: frames run one at a time when
      // capture() is tapped.
      const scale = Math.min(
        1,
        settingsRef.current.processingSize / Math.max(video.videoWidth, video.videoHeight),
      );
      drawOverlay(
        null,
        "",
        Math.round(video.videoWidth * scale),
        Math.round(video.videoHeight * scale),
        0,
      );
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
      const inFlight = runFrame();
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
    start,
    stop,
    capture,
    clearHistory,
  };
}
