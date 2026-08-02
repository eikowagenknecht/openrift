import type { CardEmbedder, OpenCvLike, OrbCvLike } from "@openrift/shared/scan";
import { useEffect, useRef, useState } from "react";

import { loadScanEmbedder, measuredEmbedMsPerImage } from "@/lib/scan-embedder";
import { loadOpenCv } from "@/lib/scan-opencv";
import { ORT_WASM_PATHS } from "@/lib/scan-ort-assets";
import type { ScanWorkerClient } from "@/lib/scan-worker-client";
import { createScanWorkerClient } from "@/lib/scan-worker-client";

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
 * Message for a thrown value.
 *
 * Kept out of the catch blocks themselves: the React Compiler cannot lower a
 * conditional inside a try/catch and bails out of the whole hook when it finds
 * one.
 *
 * @returns The error's message, or the fallback for a non-Error throw.
 */
export function errorMessage(thrown: unknown, fallback: string): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return fallback;
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
 * Load the scanning engine and report its readiness.
 *
 * Owns the engine's three loaders wholesale: OpenCV and the encoder in the
 * page by default, or a single worker-side loader when `?scanWorker=1` asks
 * for it. The refs it returns are stable objects written only here; the
 * scanner hook reads them and never assigns them.
 *
 * @param onError Reports a failed load as a user-facing message. Held in a
 *   ref, so an unstable closure cannot re-fire the load effects.
 * @returns The engine refs (cv, embedder, worker), readiness flags, the
 *   measured per-image encoder cost and the download progress.
 */
export function useScanEngine(assets: ScanEngineAssets | null, onError: (message: string) => void) {
  const cvRef = useRef<(OpenCvLike & OrbCvLike) | null>(null);
  const embedderRef = useRef<CardEmbedder | null>(null);
  // The worker path, when this session is running one. Null means the pipeline
  // runs in the page, which is still the default (see WORKER_PARAM).
  const workerRef = useRef<ScanWorkerClient | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [embedderReady, setEmbedderReady] = useState(false);
  // The init self-bench's per-image encoder cost, for the too-slow notice.
  const [embedMsPerImage, setEmbedMsPerImage] = useState(0);
  const [engineProgress, setEngineProgress] = useState<EngineProgress>(INITIAL_ENGINE_PROGRESS);

  // Mirrored into a ref so the load effects can report failures without
  // depending on the callback's identity: an identity change mid-download
  // would run the cleanup and orphan the load.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
        onErrorRef.current(errorMessage(initError, "The scanning engine failed to start"));
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
        onErrorRef.current(message);
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
        onErrorRef.current(message);
      }
    }
    void loadEncoder();
    return () => {
      cancelled = true;
    };
  }, [encoderUrl]);

  // The worker is this hook's own allocation, so its unmount teardown lives
  // here; everything session-shaped stays with the scanner hook.
  useEffect(
    () => () => {
      const worker = workerRef.current;
      workerRef.current = null;
      worker?.terminate();
    },
    [],
  );

  return { cvRef, embedderRef, workerRef, cvReady, embedderReady, embedMsPerImage, engineProgress };
}
