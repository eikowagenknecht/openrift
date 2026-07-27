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
import { CARD_ASPECT, DEFAULT_SESSION_OPTIONS, createScanSession } from "@openrift/shared/scan";
import { useEffect, useRef, useState } from "react";

import { fetchWithProgress } from "@/lib/fetch-progress";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import { loadScanEmbedder } from "@/lib/scan-embedder";

/**
 * `single` asks the user to place one card in a drawn guide rect: detection is
 * anchored to the guide, junk elsewhere in frame is ignored, and the
 * verification shortlist is trimmed. `pan` is the free-form mode for panning
 * over a binder page or spread-out cards.
 */
export type ScannerMode = "single" | "pan";

export interface ScannerSettings {
  mode: ScannerMode;
  /** Long side the camera frame is scaled to before processing. */
  processingSize: number;
  /** Detector proposals rectified and embedded per frame. */
  candidatesToTry: number;
  /**
   * Staged-embedding gate (see `ScanSessionOptions.confidentDistance`).
   * Negative runs the ungated four-rotation embedding of every candidate.
   */
  confidentDistance: number;
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
  confidentDistance: DEFAULT_SESSION_OPTIONS.confidentDistance,
};

/** Verification shortlist in single-card mode; pan mode keeps the calibrated 8. */
const SINGLE_MODE_TOP_K = 4;

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
  /** Wall-clock time of the lock. */
  at: number;
  /** Seconds from the start of the run of agreeing frames to the lock. */
  lockSeconds: number;
  framesToLock: number;
  inliers: number;
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
 * Kept at module level because the React Compiler cannot lower a conditional
 * value block inside a try/catch, and the still-image path needs this inside
 * one.
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
 * ESM wrapping of the 10.8 MB emscripten UMD spins the main thread forever
 * during evaluation, in every engine tested, while the raw script evaluates
 * in well under a second. Fetched to a blob first so the download can report
 * progress; a script tag exposes none. Kept at module level because the React
 * Compiler cannot lower a dynamic loader inside a hook.
 *
 * @returns The initialised OpenCV module.
 */
async function loadOpenCv(
  onProgress?: (loaded: number, total: number) => void,
): Promise<OpenCvLike & OrbCvLike> {
  if (onProgress) {
    cvProgressListener = onProgress;
  }
  /* oxlint-disable promise/prefer-catch, promise/always-return, promise/avoid-new -- adapting a script tag and a foreign thenable; every path settles */
  cvCached ??= (async () => {
    const source = await fetchWithProgress(
      "/scan-opencv.js",
      (loaded, total) => cvProgressListener?.(loaded, total),
      "scan-opencv.js is missing. Run: bun scripts/scan/export-index.ts",
    );
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
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
export function useCardScanner(loaded: LoadedScanBank | null, settings: ScannerSettings) {
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
  const lastPublishRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<ScannerReadout>(EMPTY_READOUT);
  const [stillPreview, setStillPreview] = useState<string | null>(null);
  const cvRef = useRef<(OpenCvLike & OrbCvLike) | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const embedderRef = useRef<CardEmbedder | null>(null);
  const [embedderReady, setEmbedderReady] = useState(false);
  const [engineProgress, setEngineProgress] = useState<EngineProgress>(INITIAL_ENGINE_PROGRESS);

  // Loaded only when asked for, and only on this route: the build is around ten
  // megabytes, which has no business in the main bundle.
  useEffect(() => {
    if (cvRef.current) {
      return;
    }
    let cancelled = false;
    async function loadCv(): Promise<void> {
      let cv: (OpenCvLike & OrbCvLike) | null = null;
      let message: string | null = null;
      try {
        cv = await loadOpenCv((loadedBytes, totalBytes) => {
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
  }, []);

  // The encoder download is around forty megabytes, so it starts immediately on
  // mount rather than on the first Start press.
  useEffect(() => {
    if (embedderRef.current) {
      return;
    }
    let cancelled = false;
    async function loadEncoder(): Promise<void> {
      let embedder: CardEmbedder | null = null;
      let message: string | null = null;
      try {
        embedder = await loadScanEmbedder((loadedBytes, totalBytes) => {
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
  }, []);

  // Mirrored into a ref so the frame loop always reads current settings without
  // being torn down and restarted. Writing it in an effect rather than during
  // render keeps the React Compiler from bailing out of the whole hook.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
    return createScanSession(
      {
        cv,
        embedder,
        bank: loaded.bank,
        artKeyOf: (key) => loaded.artKeys.get(key) ?? key,
        labelOf: (key) => describeKey(loaded.labels, key),
        cardTypeOf: (key) => loaded.labels[key]?.type,
        publicCodeOf: (key) => loaded.labels[key]?.code,
        fetchReference,
      },
      {
        candidatesToTry: settingsRef.current.candidatesToTry,
        confidentDistance: settingsRef.current.confidentDistance,
        ...(settingsRef.current.mode === "single"
          ? {
              guideFor: guideQuadFor,
              topK: SINGLE_MODE_TOP_K,
              // One card by premise and ORB margin still gates every frame; a
              // 3-frame run shaves ~200 ms off each lock. Pan keeps the
              // clip-calibrated 4 (a 3-frame burst once false-locked there).
              accept: { ...DEFAULT_SESSION_OPTIONS.accept, lockRun: 3 },
            }
          : {}),
      },
    );
  }

  function grabFrame(video: HTMLVideoElement): RgbaImage | null {
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
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height);
    return { data: data.data, width, height };
  }

  function drawOverlay(
    candidate: CardCandidate | null,
    color: string,
    frameWidth: number,
    frameHeight: number,
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
    // outline drifts away from the card.
    const scale = Math.max(canvas.width / frameWidth, canvas.height / frameHeight);
    const offsetX = (canvas.width - frameWidth * scale) / 2;
    const offsetY = (canvas.height - frameHeight * scale) / 2;
    const mapped = (quad: Quad) =>
      quad.map((point) => ({
        x: point.x * scale + offsetX,
        y: point.y * scale + offsetY,
      })) as unknown as Quad;

    if (settingsRef.current.mode === "single") {
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
    const lockSeconds = (track.lockedAt ?? track.runStartSeconds) - track.runStartSeconds;
    locksRef.current = [
      {
        key: track.key,
        artKey: track.artKey,
        label: track.label,
        at: Date.now(),
        lockSeconds,
        framesToLock: track.framesToLock ?? 0,
        inliers: outcome.winner === null ? 0 : outcome.winner.inliers,
      },
      ...locksRef.current,
    ].slice(0, 30);
    console.log(
      `[scan] LOCK ${track.label} (${track.key}) after ${track.framesToLock ?? 0} frames, ${lockSeconds.toFixed(2)}s`,
    );
    // A short buzz marks the lock moment, so on a phone the eyes can stay on
    // the cards instead of the lock list.
    navigator.vibrate?.(50);
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
    refreshed[index] = { ...refreshed[index], key: update.key, label: update.label };
    locksRef.current = refreshed;
  }

  async function runFrame(): Promise<void> {
    const video = videoRef.current;
    const session = sessionRef.current;
    if (!video || !session) {
      return;
    }
    const frame = grabFrame(video);
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

    noteLock(outcome);
    notePrinting(outcome);

    // Dev diagnostic: the devtools vite plugin pipes this to the terminal, so
    // phone runs can be watched from the dev-server log.
    const timings = outcome.timings;
    const top = outcome.ranked[0];
    const topPart = top
      ? ` top ${top.key} d${top.distance.toFixed(3)} r${top.rotation}`
      : " no-candidate";
    const winnerPart = outcome.winner
      ? ` winner ${outcome.winner.key} inliers ${outcome.winner.inliers} rival ${outcome.winner.rivalInliers}`
      : outcome.refused
        ? " refused"
        : "";
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
      setError(errorMessage(cameraError, "Could not open the camera"));
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
    setStillPreview(null);
    console.log(
      `[scan] START mode ${settingsRef.current.mode} processingSize ${settingsRef.current.processingSize} candidatesToTry ${settingsRef.current.candidatesToTry}` +
        ` confidentDistance ${settingsRef.current.confidentDistance}` +
        ` video ${video?.videoWidth ?? 0}x${video?.videoHeight ?? 0}`,
    );

    // Declared here rather than at hook level so the loop never references a
    // hoisted function by name; the React Compiler cannot rewrite that and
    // bails out of the entire hook when it sees one.
    const loop = () => {
      if (!runningRef.current) {
        return;
      }
      const inFlight = runFrame();
      frameInFlightRef.current = inFlight;
      /* oxlint-disable promise/prefer-await-to-then, promise/prefer-catch -- the rAF loop is callback-shaped; a rejected frame must not kill it */
      inFlight.then(
        () => requestAnimationFrame(loop),
        (frameError: unknown) => {
          setError(errorMessage(frameError, "Frame processing failed"));
          requestAnimationFrame(loop);
        },
      );
      /* oxlint-enable promise/prefer-await-to-then, promise/prefer-catch */
    };
    requestAnimationFrame(loop);
    startingRef.current = false;
  }

  function stop() {
    runGenerationRef.current++;
    runningRef.current = false;
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

  /**
   * Run a single still image, from the file picker or the phone's camera app.
   *
   * A live feed needs a secure context, which a plain LAN dev server is not.
   * Capturing one photo goes through the OS camera instead, so the pipeline can
   * still be exercised on a real phone against real cards. One photo shows the
   * raw frame verdict; several photos of the same card in a row count as
   * agreeing frames and can lock it, exactly like the live loop.
   *
   * @returns Nothing; the readout is updated in place.
   */
  async function scanStill(file: File) {
    // The live loop owns the session while running; a still would race its
    // in-flight frame on the session's shared scratch buffers.
    if (startingRef.current || runningRef.current) {
      return;
    }
    setError(null);
    if (!sessionRef.current) {
      sessionRef.current = createSession();
      sessionStartRef.current = performance.now();
    }
    const session = sessionRef.current;
    if (!session) {
      setError("The engine is still loading, try again in a moment.");
      return;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (stillError) {
      setError(errorMessage(stillError, "Could not read that image"));
      return;
    }

    const current = settingsRef.current;
    const scale = Math.min(1, current.processingSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      return;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const imageData = context.getImageData(0, 0, width, height);

    const inFlight = session.processFrame(
      { data: imageData.data, width, height },
      frameIndexRef.current++,
      (performance.now() - sessionStartRef.current) / 1000,
      () => performance.now(),
    );
    frameInFlightRef.current = inFlight;
    const outcome = await inFlight;

    noteLock(outcome);
    strokeQuad(
      context,
      outcome.candidate === null ? undefined : outcome.candidate.quad,
      outcome.winner ? "rgba(74, 222, 128, 0.95)" : "rgba(148, 163, 184, 0.9)",
      outcome.winner === null,
    );
    setStillPreview(canvas.toDataURL("image/jpeg", 0.8));
    publish(outcome, true);
  }

  function clearHistory() {
    locksRef.current = [];
    frameTimesRef.current = [];
    setStillPreview(null);
    setReadout({ ...EMPTY_READOUT });
  }

  return {
    videoRef,
    overlayRef,
    cvReady,
    embedderReady,
    engineProgress,
    active,
    error,
    readout,
    stillPreview,
    start,
    stop,
    scanStill,
    clearHistory,
  };
}
