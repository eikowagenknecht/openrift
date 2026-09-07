import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import type { RenderJob, RenderResponse } from "./render-job.js";
import type { CreateRenderWorker, RenderWorkerHandle } from "./render-pool.js";
import {
  configureRenderPool,
  renderImage,
  renderPoolStats,
  shutdownRenderPool,
} from "./render-pool.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

interface FakeWorker extends RenderWorkerHandle {
  readonly received: { id: number; job: RenderJob }[];
  reply: (response: RenderResponse) => void;
  fail: (error: Error) => void;
  readonly terminated: () => boolean;
}

function fakeWorkers(): { create: CreateRenderWorker; all: FakeWorker[] } {
  const all: FakeWorker[] = [];
  const create: CreateRenderWorker = (onMessage, onError) => {
    const received: { id: number; job: RenderJob }[] = [];
    let terminated = false;
    const worker: FakeWorker = {
      received,
      postMessage: (message) => received.push(message),
      terminate: () => {
        terminated = true;
      },
      reply: onMessage,
      fail: onError,
      terminated: () => terminated,
    };
    all.push(worker);
    return worker;
  };
  return { create, all };
}

function shareJob(): RenderJob {
  return {
    kind: "share",
    input: {
      ownerName: "Owner",
      title: "Summoner Skirmish",
      intentLabel: "Wishlist",
      unit: { one: "card", many: "cards" },
      cards: [],
      totalCount: 0,
    },
    scale: 1,
    options: {},
  };
}

/** Several tests abandon a job on purpose; shutdown rejects it in afterEach. */
function start(): Promise<Buffer> {
  const pending = renderImage(shareJob());
  pending.catch(() => undefined);
  return pending;
}

let workers: ReturnType<typeof fakeWorkers>;

beforeEach(() => {
  workers = fakeWorkers();
  configureRenderPool({ workers: 2, queueLimit: 3, timeoutMs: 1000, createWorker: workers.create });
});

afterEach(() => {
  shutdownRenderPool();
  vi.useRealTimers();
});

describe("renderImage", () => {
  it("resolves with the PNG the worker returns", async () => {
    const pending = start();
    const worker = workers.all[0]!;

    worker.reply({ id: worker.received[0]!.id, ok: true, png: PNG });

    await expect(pending).resolves.toEqual(Buffer.from(PNG));
  });

  it("runs jobs on separate workers up to the pool size", async () => {
    const first = start();
    const second = start();

    expect(workers.all).toHaveLength(2);
    expect(renderPoolStats()).toMatchObject({ active: 2, queued: 0 });

    for (const worker of workers.all) {
      worker.reply({ id: worker.received[0]!.id, ok: true, png: PNG });
    }
    await Promise.all([first, second]);
  });

  it("queues past the pool size and hands the job to the worker that frees up", async () => {
    const first = start();
    void start();
    const third = start();

    expect(renderPoolStats()).toMatchObject({ active: 2, queued: 1 });
    expect(workers.all[0]!.received).toHaveLength(1);

    const worker = workers.all[0]!;
    worker.reply({ id: worker.received[0]!.id, ok: true, png: PNG });
    await first;

    expect(worker.received).toHaveLength(2);
    worker.reply({ id: worker.received[1]!.id, ok: true, png: PNG });
    await expect(third).resolves.toEqual(Buffer.from(PNG));
  });

  it("rejects with 503 once the queue is full, so a burst fails fast", async () => {
    const started = [start(), start(), start(), start(), start()];

    const overflow = renderImage(shareJob());

    await expect(overflow).rejects.toMatchObject({ status: 503 });
    await expect(overflow).rejects.toBeInstanceOf(AppError);

    shutdownRenderPool();
    await Promise.allSettled(started);
  });

  it("propagates a render failure without killing the worker", async () => {
    const pending = start();
    const worker = workers.all[0]!;

    worker.reply({ id: worker.received[0]!.id, ok: false, message: "satori blew up" });

    await expect(pending).rejects.toThrow("satori blew up");
    expect(worker.terminated()).toBe(false);
  });

  it("replaces a worker that errors and fails only its own job", async () => {
    const pending = start();
    const worker = workers.all[0]!;

    worker.fail(new Error("worker exited"));

    await expect(pending).rejects.toThrow("worker exited");
    expect(worker.terminated()).toBe(true);

    const next = start();
    const replacement = workers.all.at(-1)!;
    expect(replacement).not.toBe(worker);
    replacement.reply({ id: replacement.received[0]!.id, ok: true, png: PNG });
    await expect(next).resolves.toEqual(Buffer.from(PNG));
  });

  it("terminates a worker wedged past the timeout", async () => {
    vi.useFakeTimers();
    const pending = start();
    const worker = workers.all[0]!;

    vi.advanceTimersByTime(1001);

    await expect(pending).rejects.toMatchObject({ status: 503 });
    expect(worker.terminated()).toBe(true);
  });

  it("falls back to the default pool size when the env var is empty", async () => {
    configureRenderPool({
      workers: Number(""),
      queueLimit: Number(""),
      createWorker: workers.create,
    });

    const pending = start();

    expect(renderPoolStats()).toMatchObject({ workers: 2, active: 1 });
    workers.all[0]!.reply({ id: workers.all[0]!.received[0]!.id, ok: true, png: PNG });
    await expect(pending).resolves.toEqual(Buffer.from(PNG));
  });

  it("ignores a reply that arrives after its job timed out", async () => {
    vi.useFakeTimers();
    const pending = start();
    const worker = workers.all[0]!;
    const staleId = worker.received[0]!.id;

    vi.advanceTimersByTime(1001);
    await expect(pending).rejects.toMatchObject({ status: 503 });

    expect(() => worker.reply({ id: staleId, ok: true, png: PNG })).not.toThrow();
    expect(renderPoolStats()).toMatchObject({ active: 0, queued: 0 });
  });
});
