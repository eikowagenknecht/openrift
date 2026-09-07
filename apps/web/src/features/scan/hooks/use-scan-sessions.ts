import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import type { CardEmbedder } from "@openrift/shared/scan/embed";
import type { OrbCvLike } from "@openrift/shared/scan/orb";
import type { ScanSession } from "@openrift/shared/scan/session";
import type { RgbaImage } from "@openrift/shared/scan/types";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import {
  SLOW_DEVICE_EMBED_MS,
  embedderImageSize,
  measuredEmbedMsPerImage,
} from "@/features/scan/lib/scan-embedder";
import type { ScanSessionPlan, ScannerSettings } from "@/features/scan/lib/scan-session";
import {
  createConfiguredScanSession,
  gatesForBank,
  scanSessionPlans,
} from "@/features/scan/lib/scan-session";
import type { ScanWorkerClient } from "@/features/scan/lib/scan-worker-client";
import type { ScanWorkerOutcome, SessionKind } from "@/workers/scan-worker";

export interface ScanSessionsOptions {
  loaded: LoadedScanBank | null;
  settingsRef: RefObject<ScannerSettings>;
  frameInFlightRef: RefObject<Promise<unknown> | null>;
  setIdleGate: (distance: number) => void;
  cvRef: RefObject<(OpenCvLike & OrbCvLike) | null>;
  embedderRef: RefObject<CardEmbedder | null>;
  workerRef: RefObject<ScanWorkerClient | null>;
  embedMsPerImage: number;
}

export interface ScanSessions {
  prepare: () => Promise<boolean>;
  ready: () => boolean;
  processFrame: (
    kind: SessionKind,
    frame: RgbaImage,
    index: number,
    seconds: number,
  ) => Promise<ScanWorkerOutcome | null>;
  rearm: () => void;
}

export function useScanSessions(options: ScanSessionsOptions): ScanSessions {
  const { loaded, settingsRef, frameInFlightRef, cvRef, embedderRef, workerRef } = options;
  const sessionRef = useRef<ScanSession | null>(null);
  const catchUpSessionRef = useRef<ScanSession | null>(null);

  // Releases the session's OpenCV allocations only after any in-flight frame
  // has finished with them.
  useEffect(
    () => () => {
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
    [frameInFlightRef],
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
    options.setIdleGate(gates.rotationFallbackDistance);
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

  function ready(): boolean {
    return sessionRef.current !== null || workerRef.current !== null;
  }

  async function prepare(): Promise<boolean> {
    // A previous run's frame may still hold the session's OpenCV allocations;
    // wait it out before replacing the session.
    await Promise.resolve(frameInFlightRef.current);
    sessionRef.current?.release();
    catchUpSessionRef.current?.release();
    // The worker measures the encoder on its own thread and reports the cost
    // back; in-page the module-level self-bench holds it.
    const worker = workerRef.current;
    const plans = sessionPlans(worker ? options.embedMsPerImage : measuredEmbedMsPerImage());
    if (worker && plans) {
      worker.create(plans.live, plans.catchUp);
    } else {
      const sessions = plans ? createSessions(plans) : null;
      sessionRef.current = sessions === null ? null : sessions.live;
      catchUpSessionRef.current = sessions === null ? null : sessions.catchUp;
    }
    return ready();
  }

  /**
   * Frames handed to the worker are transferred; the buffer must not be
   * touched after this call either way.
   */
  async function processFrame(
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

  function rearm(): void {
    if (workerRef.current) {
      workerRef.current.rearm();
      return;
    }
    sessionRef.current?.rearm();
  }

  return { prepare, ready, processFrame, rearm };
}
