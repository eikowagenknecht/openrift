import type {
  ArtTrack,
  CardEmbedder,
  FrameOutcome,
  OpenCvLike,
  OrbCvLike,
  RgbaImage,
  ScanSession,
} from "@openrift/shared/scan";

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
 *
 * Only the transport lives here. Loading the engine, decoding references and
 * configuring sessions are the same modules the page uses (`scan-opencv.ts`,
 * `scan-reference-image.ts`, `scan-session.ts`), so the two paths cannot drift
 * into scanning differently.
 */
import { loadScanBank } from "@/lib/scan-bank";
import { embedderImageSize, loadScanEmbedder, measuredEmbedMsPerImage } from "@/lib/scan-embedder";
import { loadOpenCvInWorker } from "@/lib/scan-opencv";
import type { ScanSessionPlan } from "@/lib/scan-session";
import { createConfiguredScanSession } from "@/lib/scan-session";

/** Session kinds the worker keeps: the live pass and the never-locking second look. */
export type SessionKind = "live" | "catchUp";

export interface ScanWorkerInit {
  type: "init";
  opencvUrl: string;
  encoderUrl: string;
  bankUrl: string;
  labelsUrl: string;
  /** Resolved by the page: see scan-ort-assets.ts for why not here. */
  wasmPaths: { wasm: string };
}

export type ScanWorkerRequest =
  | ScanWorkerInit
  | { type: "create"; live: ScanSessionPlan; catchUp: ScanSessionPlan }
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
let bank: Awaited<ReturnType<typeof loadScanBank>> | null = null;
const sessions = new Map<SessionKind, ScanSession>();

/**
 * Build one session over the loaded engine.
 *
 * @returns The session.
 */
function buildSession(plan: ScanSessionPlan): ScanSession {
  if (!cv || !embedder || !bank) {
    throw new Error("the engine is not loaded");
  }
  return createConfiguredScanSession(
    { cv, embedder, embedImageSize: embedderImageSize() },
    bank,
    plan,
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
      post({
        type: "ready",
        embedMsPerImage: measuredEmbedMsPerImage(),
        embedImageSize: embedderImageSize(),
        canonical: loadedBank.canonical,
      });
      return;
    }

    if (request.type === "create") {
      for (const session of sessions.values()) {
        session.release();
      }
      sessions.clear();
      sessions.set("live", buildSession(request.live));
      sessions.set("catchUp", buildSession(request.catchUp));
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
