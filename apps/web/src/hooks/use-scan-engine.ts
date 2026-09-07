import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import type { CardEmbedder } from "@openrift/shared/scan/embed";
import type { OrbCvLike } from "@openrift/shared/scan/orb";
import { useEffect, useRef, useState } from "react";

import { errorText } from "@/lib/error-text";
import { loadScanEmbedder, measuredEmbedMsPerImage } from "@/lib/scan-embedder";
import type { EngineProgress } from "@/lib/scan-load-progress";
import { loadOpenCv } from "@/lib/scan-opencv";
import { ORT_WASM_PATHS } from "@/lib/scan-ort-assets";
import type { ScanWorkerClient } from "@/lib/scan-worker-client";
import { createScanWorkerClient } from "@/lib/scan-worker-client";

const WORKER_PARAM = "scanWorker";

function workerRequested(): boolean {
  if (typeof Worker === "undefined") {
    return false;
  }
  const params = new URLSearchParams(globalThis.location?.search ?? "");
  return params.get(WORKER_PARAM) === "1";
}

const INITIAL_ENGINE_PROGRESS: EngineProgress = {
  opencv: { loaded: 0, total: 0, ready: false },
  encoder: { loaded: 0, total: 0, ready: false },
};

export interface ScanEngineAssets {
  encoderUrl: string;
  opencvUrl: string;
  bankUrl?: string;
  labelsUrl?: string;
}

export function useScanEngine(assets: ScanEngineAssets | null, onError: (message: string) => void) {
  const cvRef = useRef<(OpenCvLike & OrbCvLike) | null>(null);
  const embedderRef = useRef<CardEmbedder | null>(null);
  const workerRef = useRef<ScanWorkerClient | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [embedderReady, setEmbedderReady] = useState(false);
  const [embedMsPerImage, setEmbedMsPerImage] = useState(0);
  const [engineProgress, setEngineProgress] = useState<EngineProgress>(INITIAL_ENGINE_PROGRESS);

  // Mirrored into a ref: an unstable onError identity would re-fire the load
  // effects and orphan a download mid-flight.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Primitive deps: the assets object's identity is render-derived and an
  // identity change mid-download would orphan the load.
  const opencvUrl = assets?.opencvUrl ?? null;
  const encoderUrl = assets?.encoderUrl ?? null;
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
        workerRef.current = null;
        started.terminate();
        onErrorRef.current(errorText(initError, "The scanning engine failed to start"));
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [opencvUrl, encoderUrl, bankUrl, labelsUrl]);

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
        message = errorText(loadError, "Could not load OpenCV");
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
        message = errorText(loadError, "Could not load the encoder model");
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
