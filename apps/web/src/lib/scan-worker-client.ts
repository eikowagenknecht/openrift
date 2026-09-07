/**
 * Frames are answered in the order they were sent, so a reply belongs to the
 * oldest outstanding request of its kind. Frame buffers are transferred, not
 * copied, so the caller must not read a frame after handing it over.
 */
import { ORT_WASM_PATHS } from "@/lib/scan-ort-assets";
import type { ScanSessionPlan } from "@/lib/scan-session";
import type {
  ScanWorkerOutcome,
  ScanWorkerRequest,
  ScanWorkerResponse,
  SessionKind,
} from "@/workers/scan-worker";

interface ScanWorkerReady {
  embedMsPerImage: number;
  embedImageSize: number;
  canonical: boolean;
}

export interface ScanWorkerClient {
  /** Resolves when the worker can take frames. */
  init: (urls: {
    opencvUrl: string;
    encoderUrl: string;
    bankUrl: string;
    labelsUrl: string;
  }) => Promise<ScanWorkerReady>;
  /** Replaces both sessions. */
  create: (live: ScanSessionPlan, catchUp: ScanSessionPlan) => void;
  processFrame: (
    kind: SessionKind,
    frame: { data: Uint8ClampedArray; width: number; height: number },
    index: number,
    seconds: number,
  ) => Promise<ScanWorkerOutcome>;
  rearm: () => void;
  terminate: () => void;
}

/**
 * Throws synchronously when the browser will not create the worker at all, so
 * the caller can fall back to running the pipeline in the page.
 */
export function createScanWorkerClient(
  onProgress?: (asset: "opencv" | "encoder", loaded: number, total: number) => void,
): ScanWorkerClient {
  const worker = new Worker(new URL("@/workers/scan-worker.ts", import.meta.url), {
    type: "module",
    name: "scan",
  });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (r: ScanWorkerOutcome) => void; reject: (e: Error) => void }
  >();
  let readyResolve: ((ready: ScanWorkerReady) => void) | null = null;
  let readyReject: ((error: Error) => void) | null = null;

  worker.addEventListener("message", (event: MessageEvent<ScanWorkerResponse>) => {
    const message = event.data;
    if (message.type === "progress") {
      onProgress?.(message.asset, message.loaded, message.total);
      return;
    }
    if (message.type === "ready") {
      readyResolve?.({
        embedMsPerImage: message.embedMsPerImage,
        embedImageSize: message.embedImageSize,
        canonical: message.canonical,
      });
      readyResolve = null;
      readyReject = null;
      return;
    }
    if (message.type === "outcome") {
      pending.get(message.id)?.resolve(message.result);
      pending.delete(message.id);
      return;
    }
    const error = new Error(message.message);
    if (message.id === undefined) {
      // No frame id means the error happened during init or session setup.
      readyReject?.(error);
      readyReject = null;
      readyResolve = null;
      return;
    }
    pending.get(message.id)?.reject(error);
    pending.delete(message.id);
  });

  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "the scan worker stopped");
    readyReject?.(error);
    readyReject = null;
    readyResolve = null;
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  });

  const send = (request: ScanWorkerRequest, transfer?: Transferable[]) => {
    worker.postMessage(request, transfer ?? []);
  };

  return {
    init(urls) {
      /* oxlint-disable-next-line promise/avoid-new -- bridging a message protocol to a promise */
      return new Promise<ScanWorkerReady>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
        send({ type: "init", ...urls, wasmPaths: ORT_WASM_PATHS });
      });
    },
    create(live, catchUp) {
      send({ type: "create", live, catchUp });
    },
    processFrame(kind, frame, index, seconds) {
      const id = nextId++;
      // A view into a larger buffer can't be transferred piecemeal; slice
      // copies it as a fallback for that case.
      const buffer =
        frame.data.byteOffset === 0 && frame.data.byteLength === frame.data.buffer.byteLength
          ? (frame.data.buffer as ArrayBuffer)
          : (new Uint8ClampedArray(frame.data).buffer as ArrayBuffer);
      /* oxlint-disable-next-line promise/avoid-new -- bridging a message protocol to a promise */
      return new Promise<ScanWorkerOutcome>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send(
          {
            type: "frame",
            id,
            kind,
            buffer,
            width: frame.width,
            height: frame.height,
            index,
            seconds,
          },
          [buffer],
        );
      });
    },
    rearm() {
      send({ type: "rearm" });
    },
    terminate() {
      send({ type: "release" });
      worker.terminate();
      for (const waiter of pending.values()) {
        waiter.reject(new Error("the scan worker was stopped"));
      }
      pending.clear();
    },
  };
}
