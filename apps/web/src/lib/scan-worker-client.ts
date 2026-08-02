/**
 * The page's side of the scan worker.
 *
 * Turns the message protocol into promises, and keeps the one invariant the
 * protocol needs: frames are answered in the order they were sent, so a reply
 * belongs to the oldest outstanding request of its kind. Nothing here knows
 * about the camera or React.
 *
 * Frame buffers are transferred, not copied. That is the whole reason this is
 * affordable: a processing-size frame is around 1.6 MB, and copying one per
 * frame would hand back a good part of what moving the work off the main
 * thread just bought. Transferring detaches the buffer on this side, so the
 * caller must not read the frame after handing it over.
 */
import { ORT_WASM_PATHS } from "@/lib/scan-ort-assets";
import type {
  ScanWorkerOutcome,
  ScanWorkerRequest,
  ScanWorkerResponse,
  ScanWorkerSessionOptions,
  SessionKind,
} from "@/workers/scan-worker";

interface ScanWorkerReady {
  embedMsPerImage: number;
  embedImageSize: number;
  canonical: boolean;
}

export interface ScanWorkerClient {
  /** Load the engine inside the worker. Resolves when it can take frames. */
  init: (urls: {
    opencvUrl: string;
    encoderUrl: string;
    bankUrl: string;
    labelsUrl: string;
  }) => Promise<ScanWorkerReady>;
  /** Replace both sessions. */
  create: (live: ScanWorkerSessionOptions, catchUp: ScanWorkerSessionOptions) => void;
  /**
   * Run one frame. The frame's buffer is transferred and must not be touched
   * afterwards.
   */
  processFrame: (
    kind: SessionKind,
    frame: { data: Uint8ClampedArray; width: number; height: number },
    index: number,
    seconds: number,
  ) => Promise<ScanWorkerOutcome>;
  rearm: () => void;
  /** Drop the sessions and tear the worker down. */
  terminate: () => void;
}

/**
 * Start the scan worker.
 *
 * Throws synchronously when the browser will not create the worker at all, so
 * the caller can fall back to running the pipeline in the page.
 *
 * @returns The client.
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
      // An error with no frame attached happened during init or session
      // setup; it belongs to whoever is waiting for readiness.
      readyReject?.(error);
      readyReject = null;
      readyResolve = null;
      return;
    }
    pending.get(message.id)?.reject(error);
    pending.delete(message.id);
  });

  // A worker that dies (an OOM inside the wasm heap, most likely) must not
  // leave the page waiting forever on frames that will never be answered.
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
      // A view into a larger buffer cannot be transferred piecemeal, and the
      // canvas hands back exactly-sized buffers, so this is normally the whole
      // thing. The slice is the safety net for a view, at the cost of a copy.
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
