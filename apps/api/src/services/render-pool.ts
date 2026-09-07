import { ERROR_CODES } from "@openrift/shared/error-codes";

import { AppError } from "../errors.js";
import type { RenderJob, RenderResponse } from "./render-job.js";

/**
 * satori layout and resvg rasterization are synchronous, so a render on the
 * server's own loop stalls every unrelated request for its whole duration (a
 * crawler enumerating og:images stalled the API for 5s at a time). Renders run
 * in worker threads instead, with a bounded queue so a burst fails fast rather
 * than queueing past the client's own timeout.
 */

export interface RenderWorkerHandle {
  postMessage: (message: { id: number; job: RenderJob }) => void;
  terminate: () => void;
}

export type CreateRenderWorker = (
  onMessage: (response: RenderResponse) => void,
  onError: (error: Error) => void,
) => RenderWorkerHandle;

export interface RenderPoolOptions {
  workers: number;
  queueLimit: number;
  timeoutMs: number;
  createWorker: CreateRenderWorker;
}

function spawnWorker(
  onReply: (response: RenderResponse) => void,
  onFailure: (error: Error) => void,
): RenderWorkerHandle {
  const worker = new Worker(new URL("render-worker.ts", import.meta.url).href, {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<RenderResponse>) => {
    onReply(event.data);
  });
  worker.addEventListener("error", (event) => {
    onFailure(new Error(event.message || "Render worker failed"));
  });
  // A live worker must not hold the process open during shutdown.
  worker.unref?.();
  return {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin
    postMessage: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
  };
}

const DEFAULTS: RenderPoolOptions = {
  workers: 2,
  queueLimit: 6,
  timeoutMs: 30_000,
  createWorker: spawnWorker,
};

interface Pending {
  id: number;
  job: RenderJob;
  resolve: (png: Buffer) => void;
  reject: (error: unknown) => void;
}

interface Slot {
  handle: RenderWorkerHandle | null;
  current: Pending | null;
  timer: ReturnType<typeof setTimeout> | null;
}

let options: RenderPoolOptions = { ...DEFAULTS };
let slots: Slot[] = [];
let queue: Pending[] = [];
let nextId = 1;

function busyError(message: string): AppError {
  return new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message);
}

function ensureSlots(): void {
  if (slots.length !== options.workers) {
    slots = Array.from({ length: options.workers }, () => ({
      handle: null,
      current: null,
      timer: null,
    }));
  }
}

function recycle(slot: Slot): void {
  slot.handle?.terminate();
  slot.handle = null;
}

function clearTimer(slot: Slot): void {
  if (slot.timer !== null) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
}

function settle(slot: Slot, settleCurrent: (pending: Pending) => void): void {
  const pending = slot.current;
  clearTimer(slot);
  slot.current = null;
  if (pending) {
    settleCurrent(pending);
  }
  pump();
}

function handleReply(slot: Slot, response: RenderResponse): void {
  // A reply from a job we already timed out and abandoned.
  if (slot.current === null || slot.current.id !== response.id) {
    return;
  }
  settle(slot, (pending) => {
    if (response.ok) {
      const png = response.png;
      pending.resolve(Buffer.from(png.buffer, png.byteOffset, png.byteLength));
    } else {
      const error = new Error(response.message);
      if (response.stack) {
        error.stack = response.stack;
      }
      pending.reject(error);
    }
  });
}

function handleFailure(slot: Slot, error: Error): void {
  recycle(slot);
  settle(slot, (pending) => pending.reject(error));
}

function onTimeout(slot: Slot): void {
  // The worker is wedged inside synchronous render work; only termination frees it.
  recycle(slot);
  settle(slot, (pending) => pending.reject(busyError("Image rendering timed out")));
}

function assign(slot: Slot, pending: Pending): void {
  slot.current = pending;
  const onReply = (response: RenderResponse): void => handleReply(slot, response);
  const onFailure = (error: Error): void => handleFailure(slot, error);
  slot.handle ??= options.createWorker(onReply, onFailure);
  slot.timer = setTimeout(() => onTimeout(slot), options.timeoutMs);
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's postMessage takes no target origin
  slot.handle.postMessage({ id: pending.id, job: pending.job });
}

function pump(): void {
  while (queue.length > 0) {
    const slot = slots.find((candidate) => candidate.current === null);
    if (!slot) {
      return;
    }
    const pending = queue.shift();
    if (!pending) {
      return;
    }
    assign(slot, pending);
  }
}

export function renderImage(job: RenderJob): Promise<Buffer> {
  ensureSlots();
  if (queue.length >= options.queueLimit) {
    return Promise.reject(busyError("Image rendering is busy, try again shortly"));
  }
  // oxlint-disable-next-line promise/avoid-new -- bridges the callback-driven worker queue to a promise
  return new Promise<Buffer>((resolve, reject) => {
    queue.push({ id: nextId++, job, resolve, reject });
    pump();
  });
}

export function shutdownRenderPool(): void {
  const outstanding = [...queue, ...slots.flatMap((slot) => (slot.current ? [slot.current] : []))];
  queue = [];
  for (const slot of slots) {
    clearTimer(slot);
    slot.current = null;
    recycle(slot);
  }
  slots = [];
  for (const pending of outstanding) {
    pending.reject(busyError("Image rendering is shutting down"));
  }
}

/** A zero from an empty env var would leave every job queued with no worker to take it. */
function atLeastOne(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

export function configureRenderPool(next: Partial<RenderPoolOptions>): void {
  shutdownRenderPool();
  const merged = { ...DEFAULTS, ...next };
  options = {
    ...merged,
    workers: atLeastOne(merged.workers, DEFAULTS.workers),
    queueLimit: atLeastOne(merged.queueLimit, DEFAULTS.queueLimit),
    timeoutMs: atLeastOne(merged.timeoutMs, DEFAULTS.timeoutMs),
  };
}

export function renderPoolStats(): { queued: number; active: number; workers: number } {
  return {
    queued: queue.length,
    active: slots.filter((slot) => slot.current !== null).length,
    workers: options.workers,
  };
}
