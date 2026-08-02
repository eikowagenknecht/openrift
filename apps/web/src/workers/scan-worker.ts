import { imageUrl } from "@openrift/shared";
import type {
  ArtTrack,
  CardEmbedder,
  FrameOutcome,
  OpenCvLike,
  OrbCvLike,
  RgbaImage,
  ScanSession,
} from "@openrift/shared/scan";
import { centeredGuideQuad, createScanSession } from "@openrift/shared/scan";

/**
 * The scan pipeline, off the main thread.
 *
 * Everything expensive about recognising a card is synchronous CPU work in
 * WebAssembly: contour detection, rectangle fitting, rectification, and above
 * all ORB, which on a throttling phone measured 0.5-2 s per frame. On the main
 * thread that time is not just slow, it is frozen: the camera preview stops
 * repainting, the overlay stops easing, and taps queue up behind it. The
 * encoder was already off-thread (onnxruntime's own proxy worker); this moves
 * the rest.
 *
 * The whole session lives here rather than just the OpenCV calls. Calling into
 * a worker per detector or per ORB match would mean six round trips a frame
 * and a rewrite of the engine's synchronous interfaces; owning the session
 * means one message in, one message out, and the shared engine untouched.
 *
 * The worker loads its own bank and labels rather than being handed them: they
 * come from immutable URLs, so the second request is a cache hit, and it keeps
 * the main thread's copy intact instead of detaching its buffers.
 */
import type { CardLabel } from "@/lib/scan-bank";
import { describeKey, loadScanBank } from "@/lib/scan-bank";
import { loadScanEmbedder } from "@/lib/scan-embedder";

/** Session kinds the worker keeps: the live pass and the never-locking second look. */
export type SessionKind = "live" | "catchUp";

export interface ScanWorkerInit {
  type: "init";
  opencvUrl: string;
  encoderUrl: string;
  bankUrl: string;
  labelsUrl: string;
  /** Resolved by the page: see scan-ort-assets.ts for why not here. */
  wasmPaths: { wasm: string; mjs: string };
}

/**
 * Session options as plain data. `guideFor` is a function on the engine's own
 * options, so it crosses as a flag and is resolved back to `centeredGuideQuad`
 * here.
 */
export interface ScanWorkerSessionOptions {
  guide: boolean;
  candidatesToTry: number;
  confidentDistance: number;
  rotationFallbackDistance: number;
  topK: number;
  rotationPairOnly: boolean;
  accept: {
    lockRun: number;
    maxGapFrames: number;
    weighted?: boolean;
    relockOnlyAfterRearm?: boolean;
  };
}

export type ScanWorkerRequest =
  | ScanWorkerInit
  | { type: "create"; live: ScanWorkerSessionOptions; catchUp: ScanWorkerSessionOptions }
  | {
      type: "frame";
      id: number;
      kind: SessionKind;
      buffer: ArrayBuffer;
      width: number;
      height: number;
      index: number;
      seconds: number;
    }
  | { type: "rearm" }
  | { type: "release" };

/** A frame's outcome, plus the run state the overlay's progress ring reads. */
export interface ScanWorkerOutcome {
  outcome: FrameOutcome;
  /** The winning artwork's run so far, or null on a winner-less frame. */
  run: { length: number; weight: number } | null;
}

export type ScanWorkerResponse =
  | { type: "progress"; asset: "opencv" | "encoder"; loaded: number; total: number }
  | { type: "ready"; embedMsPerImage: number; embedImageSize: number; canonical: boolean }
  | { type: "outcome"; id: number; result: ScanWorkerOutcome }
  | { type: "error"; id?: number; message: string };

/**
 * The worker's own globals, typed locally.
 *
 * Deliberately not `/// <reference lib="webworker" />`: that pulls the worker
 * lib into the whole web program and re-types shared globals like `Event`,
 * which breaks unrelated DOM code. This file only needs two members.
 */
interface WorkerScope {
  postMessage: (message: unknown) => void;
  addEventListener: (
    type: "message",
    listener: (event: { data: ScanWorkerRequest }) => void,
  ) => void;
}

const scope = globalThis as unknown as WorkerScope;

let cv: (OpenCvLike & OrbCvLike) | null = null;
let embedder: CardEmbedder | null = null;
let labels: Record<string, CardLabel> = {};
let artKeys = new Map<string, string>();
let bank: Awaited<ReturnType<typeof loadScanBank>> | null = null;
const sessions = new Map<SessionKind, ScanSession>();

/**
 * Load the OpenCV build into the worker.
 *
 * A module worker has no `importScripts` and no script tag, and the emscripten
 * glue must never go through the bundler's ESM wrapping (it spins forever, see
 * the loader in use-card-scanner). Fetching the text and evaluating it is what
 * is left, and it is exactly what the node bench does through `require`. The
 * `locateFile` override is set on the global the factory captures during
 * evaluation, so the split build finds its wasm beside the glue.
 *
 * @returns The initialised OpenCV module.
 */
async function loadOpenCvInWorker(
  scriptUrl: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<OpenCvLike & OrbCvLike> {
  const response = await fetch(scriptUrl);
  if (!response.ok) {
    throw new Error(`could not load OpenCV from ${scriptUrl}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body?.getReader();
  let source: string;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    source = new TextDecoder().decode(
      chunks.reduce((joined, chunk) => {
        const next = new Uint8Array(joined.length + chunk.length);
        next.set(joined);
        next.set(chunk, joined.length);
        return next;
      }, new Uint8Array(0)),
    );
  } else {
    source = await response.text();
    onProgress(total, total);
  }

  const wasmUrl = scriptUrl.replace(/\.js$/u, ".wasm");
  const globalScope = globalThis as unknown as { Module?: unknown; cv?: unknown };
  globalScope.Module = {
    locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file),
  };
  // oxlint-disable-next-line no-new-func -- the emscripten UMD must be evaluated as a classic script; see the module comment
  new Function(source)();
  /* oxlint-disable promise/avoid-new, promise/prefer-catch, promise/always-return -- the emscripten export is a thenable, not a promise: it must be unwrapped by calling `then` directly, and the callback returns nothing */
  return await new Promise<OpenCvLike & OrbCvLike>((resolve, reject) => {
    const factory = globalScope.cv as {
      then: (
        fn: (value: OpenCvLike & OrbCvLike) => void,
        onError: (error: unknown) => void,
      ) => void;
    };
    // The export is a thenable, not a promise: resolving it through one calls
    // `then` again with itself forever. Stripping `then` inside the callback
    // makes it a plain object every later await can hold.
    factory.then((ready) => {
      delete (ready as { then?: unknown }).then;
      resolve(ready);
    }, reject);
  });
  /* oxlint-enable promise/avoid-new, promise/prefer-catch, promise/always-return */
}

// Reused across reference decodes; a canvas per card would churn memory.
let referenceCanvas: OffscreenCanvas | null = null;

/**
 * Fetch and decode a reference render, the worker's own copy of the main
 * thread's `fetchReference`.
 *
 * Transient failures throw so the session retries them: a cached transient
 * miss would silently remove the rival that refuses a wrong winner.
 *
 * @returns The decoded render, or null when it does not exist.
 */
async function fetchReference(key: string): Promise<RgbaImage | null> {
  const response = await fetch(imageUrl(key, "400w"));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`reference fetch failed with status ${response.status}`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
  if (!referenceCanvas) {
    referenceCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  }
  referenceCanvas.width = bitmap.width;
  referenceCanvas.height = bitmap.height;
  const context = referenceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return null;
  }
  // Transparent rounded corners onto mid grey, matching the bank build: white
  // or black would inject an edge no photograph shows.
  context.fillStyle = "rgb(128, 128, 128)";
  context.fillRect(0, 0, referenceCanvas.width, referenceCanvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
  return { data: data.data, width: referenceCanvas.width, height: referenceCanvas.height };
}

/**
 * Build one session over the loaded engine.
 *
 * @returns The session.
 */
function buildSession(options: ScanWorkerSessionOptions, embedImageSize: number): ScanSession {
  if (!cv || !embedder || !bank) {
    throw new Error("the engine is not loaded");
  }
  return createScanSession(
    {
      cv,
      embedder,
      bank: bank.bank,
      artKeyOf: (key) => artKeys.get(key) ?? key,
      labelOf: (key) => describeKey(labels, key),
      cardTypeOf: (key) => labels[key]?.type,
      publicCodeOf: (key) => labels[key]?.code,
      markersOf: (key) => labels[key]?.markers ?? undefined,
      languageOf: (key) => labels[key]?.language,
      embedImageSize,
      fetchReference,
    },
    {
      candidatesToTry: options.candidatesToTry,
      confidentDistance: options.confidentDistance,
      rotationFallbackDistance: options.rotationFallbackDistance,
      topK: options.topK,
      rotationPairOnly: options.rotationPairOnly,
      accept: options.accept,
      ...(options.guide ? { guideFor: centeredGuideQuad } : {}),
    },
  );
}

/**
 * The run state of a frame's winner, for the overlay's progress ring.
 *
 * @returns The run, or null when the frame produced no winner.
 */
function runOf(session: ScanSession, locked: ArtTrack | null, artKey?: string) {
  const track = artKey === undefined ? locked : session.state.get(artKey);
  return track ? { length: track.runLength, weight: track.runWeight } : null;
}

scope.addEventListener("message", (event) => {
  void handle(event.data);
});

/**
 * Handle one request from the page.
 *
 * @returns Nothing; replies are posted back.
 */
async function handle(request: ScanWorkerRequest): Promise<void> {
  try {
    if (request.type === "init") {
      const [loadedCv, loadedEmbedder, loadedBank] = await Promise.all([
        loadOpenCvInWorker(request.opencvUrl, (loaded, total) =>
          post({ type: "progress", asset: "opencv", loaded, total }),
        ),
        loadScanEmbedder(
          request.encoderUrl,
          request.wasmPaths,
          (loaded, total) => post({ type: "progress", asset: "encoder", loaded, total }),
          true,
        ),
        loadScanBank(request.bankUrl, request.labelsUrl),
      ]);
      cv = loadedCv;
      embedder = loadedEmbedder;
      bank = loadedBank;
      labels = loadedBank.labels;
      artKeys = loadedBank.artKeys;
      const { embedderImageSize, measuredEmbedMsPerImage } = await import("@/lib/scan-embedder");
      post({
        type: "ready",
        embedMsPerImage: measuredEmbedMsPerImage(),
        embedImageSize: embedderImageSize(),
        canonical: loadedBank.canonical,
      });
      return;
    }

    if (request.type === "create") {
      const { embedderImageSize } = await import("@/lib/scan-embedder");
      for (const session of sessions.values()) {
        session.release();
      }
      sessions.clear();
      sessions.set("live", buildSession(request.live, embedderImageSize()));
      sessions.set("catchUp", buildSession(request.catchUp, embedderImageSize()));
      return;
    }

    if (request.type === "rearm") {
      sessions.get("live")?.rearm();
      return;
    }

    if (request.type === "release") {
      for (const session of sessions.values()) {
        session.release();
      }
      sessions.clear();
      return;
    }

    const session = sessions.get(request.kind);
    if (!session) {
      post({ type: "error", id: request.id, message: "no session" });
      return;
    }
    const frame: RgbaImage = {
      data: new Uint8ClampedArray(request.buffer),
      width: request.width,
      height: request.height,
    };
    const outcome = await session.processFrame(frame, request.index, request.seconds, () =>
      performance.now(),
    );
    post({
      type: "outcome",
      id: request.id,
      result: { outcome, run: runOf(session, outcome.locked, outcome.winner?.artKey) },
    });
  } catch (error) {
    post({
      type: "error",
      id: request.type === "frame" ? request.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Post one response to the page.
 *
 * @returns Nothing.
 */
function post(response: ScanWorkerResponse): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin
  scope.postMessage(response);
}
