import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScanSessionPlan } from "@/features/scan/lib/scan-session";
import type {
  ScanWorkerOutcome,
  ScanWorkerRequest,
  ScanWorkerResponse,
} from "@/workers/scan-worker";

vi.mock("@/features/scan/lib/scan-ort-assets", () => ({
  ORT_WASM_PATHS: { wasm: "/assets/ort.wasm" },
}));

type Listener = (event: unknown) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly posted: { message: ScanWorkerRequest; transfer: Transferable[] }[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Listener[]>();

  readonly url: URL;
  readonly options: { type: string; name: string };

  constructor(url: URL, options: { type: string; name: string }) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  postMessage(message: ScanWorkerRequest, transfer: Transferable[]): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: ScanWorkerResponse): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: response });
    }
  }

  fail(message: string): void {
    for (const listener of this.listeners.get("error") ?? []) {
      listener({ message });
    }
  }
}

const { createScanWorkerClient } = await import("./scan-worker-client");

const URLS = {
  opencvUrl: "/assets/opencv.js",
  encoderUrl: "/assets/encoder.onnx",
  bankUrl: "/assets/bank.bin",
  labelsUrl: "/assets/labels.json",
};

const PLAN: ScanSessionPlan = {
  guide: false,
  candidatesToTry: 4,
  confidentDistance: 0.3,
  rotationFallbackDistance: 0.45,
  topK: 8,
  rotationPairOnly: false,
  accept: { lockRun: 3, maxGapFrames: 2 },
};

const OUTCOME: ScanWorkerOutcome = {
  outcome: {
    candidate: null,
    ranked: [],
    winner: null,
    refused: false,
    bestInliers: 0,
    locked: null,
    focus: 0,
    timings: { detect: 0, embed: 0, verify: 0, total: 0 },
  },
  run: null,
};

function worker(): FakeWorker {
  return FakeWorker.instances.at(-1)!;
}

function wholeFrame(): { data: Uint8ClampedArray; width: number; height: number } {
  return { data: new Uint8ClampedArray(new ArrayBuffer(16)), width: 2, height: 2 };
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createScanWorkerClient", () => {
  it("starts a named module worker", () => {
    createScanWorkerClient();
    expect(worker().options).toEqual({ type: "module", name: "scan" });
  });

  it("lets a browser that refuses the worker throw synchronously", () => {
    function BlockedWorker(): never {
      throw new Error("workers blocked");
    }
    vi.stubGlobal("Worker", BlockedWorker);
    expect(() => createScanWorkerClient()).toThrow("workers blocked");
  });
});

describe("init", () => {
  it("sends the asset urls together with the wasm path the worker cannot import", () => {
    void createScanWorkerClient().init(URLS);
    expect(worker().posted[0]?.message).toEqual({
      type: "init",
      ...URLS,
      wasmPaths: { wasm: "/assets/ort.wasm" },
    });
  });

  it("resolves with what the worker measured once it is ready", async () => {
    const ready = createScanWorkerClient().init(URLS);
    worker().reply({ type: "ready", embedMsPerImage: 42, embedImageSize: 224, canonical: true });
    await expect(ready).resolves.toEqual({
      embedMsPerImage: 42,
      embedImageSize: 224,
      canonical: true,
    });
  });

  it("rejects on an error that names no frame", async () => {
    const ready = createScanWorkerClient().init(URLS);
    worker().reply({ type: "error", message: "the encoder would not start" });
    await expect(ready).rejects.toThrow("the encoder would not start");
  });

  it("rejects when the worker itself stops", async () => {
    const ready = createScanWorkerClient().init(URLS);
    worker().fail("boom");
    await expect(ready).rejects.toThrow("boom");
  });

  it("names the worker when the browser reports no message", async () => {
    const ready = createScanWorkerClient().init(URLS);
    worker().fail("");
    await expect(ready).rejects.toThrow("the scan worker stopped");
  });
});

describe("progress", () => {
  it("reports each asset's download to the caller", () => {
    const onProgress = vi.fn();
    void createScanWorkerClient(onProgress).init(URLS);
    worker().reply({ type: "progress", asset: "encoder", loaded: 5, total: 10 });
    expect(onProgress).toHaveBeenCalledWith("encoder", 5, 10);
  });

  it("leaves init pending while assets are still downloading", async () => {
    const ready = createScanWorkerClient().init(URLS);
    worker().reply({ type: "progress", asset: "opencv", loaded: 1, total: 10 });
    const settled = await Promise.race([ready.then(() => "ready"), Promise.resolve("pending")]);
    expect(settled).toBe("pending");
    worker().reply({ type: "ready", embedMsPerImage: 1, embedImageSize: 224, canonical: false });
    await ready;
  });

  it("survives a progress message with no listener", () => {
    void createScanWorkerClient().init(URLS);
    expect(() => {
      worker().reply({ type: "progress", asset: "opencv", loaded: 1, total: 10 });
    }).not.toThrow();
  });
});

describe("create", () => {
  it("sends both session plans at once", () => {
    const client = createScanWorkerClient();
    client.create(PLAN, { ...PLAN, guide: true });
    expect(worker().posted[0]?.message).toEqual({
      type: "create",
      live: PLAN,
      catchUp: { ...PLAN, guide: true },
    });
  });
});

describe("processFrame", () => {
  it("sends the frame's pixels and its place in the run", () => {
    const client = createScanWorkerClient();
    const frame = wholeFrame();
    void client.processFrame("live", frame, 7, 1.5);
    expect(worker().posted[0]?.message).toMatchObject({
      type: "frame",
      id: 1,
      kind: "live",
      width: 2,
      height: 2,
      index: 7,
      seconds: 1.5,
    });
  });

  it("transfers a frame that owns its whole buffer", () => {
    const client = createScanWorkerClient();
    const frame = wholeFrame();
    void client.processFrame("live", frame, 0, 0);
    const posted = worker().posted[0]!;
    expect(posted.transfer).toEqual([frame.data.buffer]);
  });

  it("copies a frame that is only a view into a larger buffer", () => {
    const client = createScanWorkerClient();
    const buffer = new ArrayBuffer(16);
    const frame = { data: new Uint8ClampedArray(buffer, 4, 8), width: 2, height: 1 };
    void client.processFrame("catchUp", frame, 0, 0);
    const posted = worker().posted[0]!;
    expect(posted.transfer[0]).not.toBe(buffer);
    expect((posted.transfer[0] as ArrayBuffer).byteLength).toBe(8);
  });

  it("resolves with the outcome the worker sends back for that frame", async () => {
    const client = createScanWorkerClient();
    const pending = client.processFrame("live", wholeFrame(), 0, 0);
    worker().reply({ type: "outcome", id: 1, result: OUTCOME });
    await expect(pending).resolves.toEqual(OUTCOME);
  });

  it("answers each outstanding frame with its own outcome", async () => {
    const client = createScanWorkerClient();
    const first = client.processFrame("live", wholeFrame(), 0, 0);
    const second = client.processFrame("catchUp", wholeFrame(), 1, 0.1);
    worker().reply({ type: "outcome", id: 2, result: { ...OUTCOME, run: null } });
    worker().reply({
      type: "outcome",
      id: 1,
      result: { ...OUTCOME, run: { length: 3, weight: 1 } },
    });
    await expect(first).resolves.toMatchObject({ run: { length: 3, weight: 1 } });
    await expect(second).resolves.toMatchObject({ run: null });
  });

  it("rejects only the frame an error names", async () => {
    const client = createScanWorkerClient();
    const first = client.processFrame("live", wholeFrame(), 0, 0);
    const second = client.processFrame("live", wholeFrame(), 1, 0.1);
    worker().reply({ type: "error", id: 1, message: "the frame was unreadable" });
    await expect(first).rejects.toThrow("the frame was unreadable");
    worker().reply({ type: "outcome", id: 2, result: OUTCOME });
    await expect(second).resolves.toEqual(OUTCOME);
  });

  it("rejects every outstanding frame when the worker stops", async () => {
    const client = createScanWorkerClient();
    const first = client.processFrame("live", wholeFrame(), 0, 0);
    const second = client.processFrame("live", wholeFrame(), 1, 0.1);
    worker().fail("out of memory");
    await expect(first).rejects.toThrow("out of memory");
    await expect(second).rejects.toThrow("out of memory");
  });

  it("ignores a reply for a frame that already settled", async () => {
    const client = createScanWorkerClient();
    const pending = client.processFrame("live", wholeFrame(), 0, 0);
    worker().reply({ type: "outcome", id: 1, result: OUTCOME });
    await pending;
    expect(() => {
      worker().reply({ type: "outcome", id: 1, result: OUTCOME });
    }).not.toThrow();
  });
});

describe("rearm", () => {
  it("tells the worker to allow the locked tracks to lock again", () => {
    createScanWorkerClient().rearm();
    expect(worker().posted[0]?.message).toEqual({ type: "rearm" });
  });
});

describe("terminate", () => {
  it("releases the worker's engine before killing it", () => {
    createScanWorkerClient().terminate();
    expect(worker().posted[0]?.message).toEqual({ type: "release" });
    expect(worker().terminated).toBe(true);
  });

  it("rejects the frames that will never be answered", async () => {
    const client = createScanWorkerClient();
    const pending = client.processFrame("live", wholeFrame(), 0, 0);
    client.terminate();
    await expect(pending).rejects.toThrow("the scan worker was stopped");
  });
});
