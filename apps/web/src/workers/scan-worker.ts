import type { ArtTrack } from "@openrift/shared/scan/accept";
import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import type { CardEmbedder } from "@openrift/shared/scan/embed";
import type { OrbCvLike } from "@openrift/shared/scan/orb";
import type { FrameOutcome, ScanSession } from "@openrift/shared/scan/session";
import type { RgbaImage } from "@openrift/shared/scan/types";

import { loadScanBank } from "@/features/scan/lib/scan-bank";
import {
  embedderImageSize,
  loadScanEmbedder,
  measuredEmbedMsPerImage,
} from "@/features/scan/lib/scan-embedder";
import { loadOpenCvInWorker } from "@/features/scan/lib/scan-opencv";
import type { ScanSessionPlan } from "@/features/scan/lib/scan-session";
import { createConfiguredScanSession } from "@/features/scan/lib/scan-session";

export type SessionKind = "live" | "catchUp";

export interface ScanWorkerInit {
  type: "init";
  opencvUrl: string;
  encoderUrl: string;
  bankUrl: string;
  labelsUrl: string;
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

export interface ScanWorkerOutcome {
  outcome: FrameOutcome;
  run: { length: number; weight: number } | null;
}

export type ScanWorkerResponse =
  | { type: "progress"; asset: "opencv" | "encoder"; loaded: number; total: number }
  | { type: "ready"; embedMsPerImage: number; embedImageSize: number; canonical: boolean }
  | { type: "outcome"; id: number; result: ScanWorkerOutcome }
  | { type: "error"; id?: number; message: string };

/**
 * Deliberately not `/// <reference lib="webworker" />`: that would re-type
 * shared globals like `Event` and break unrelated DOM code.
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

function runOf(session: ScanSession, locked: ArtTrack | null, artKey?: string) {
  const track = artKey === undefined ? locked : session.state.get(artKey);
  return track ? { length: track.runLength, weight: track.runWeight } : null;
}

scope.addEventListener("message", (event) => {
  void handle(event.data);
});

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

function post(response: ScanWorkerResponse): void {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin
  scope.postMessage(response);
}
