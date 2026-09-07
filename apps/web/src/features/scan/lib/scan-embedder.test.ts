import { EMBED_IMAGE_SIZE } from "@openrift/shared/scan/embed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ScanEmbedder from "./scan-embedder";

interface FakeSession {
  inputMetadata: { isTensor: boolean; shape?: readonly number[] }[];
  run: ReturnType<typeof vi.fn>;
}

const ort = {
  env: { wasm: { wasmPaths: {} as { wasm: string }, proxy: false, numThreads: 0 } },
  Tensor: class {
    readonly type: string;
    readonly data: Float32Array;
    readonly dims: number[];
    constructor(type: string, data: Float32Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  },
  InferenceSession: { create: vi.fn() },
};

const fetchWithProgress = vi.fn();

vi.mock("onnxruntime-web/wasm", () => ort);
vi.mock("@/lib/fetch-progress", () => ({ fetchWithProgress }));

const WASM_PATHS = { wasm: "/assets/ort.wasm" };
const MODEL_URL = "/media/scan/encoder.onnx";

function fakeSession(shape: readonly number[] = [1, 3, 4, 4]): FakeSession {
  return {
    inputMetadata: [{ isTensor: true, shape }],
    run: vi.fn().mockResolvedValue({ image_embeds: { data: new Float32Array([1, 2, 3]) } }),
  };
}

async function loadModule(): Promise<typeof ScanEmbedder> {
  return await import("./scan-embedder");
}

let now = 0;

beforeEach(() => {
  vi.resetModules();
  ort.env.wasm = { wasmPaths: {} as { wasm: string }, proxy: false, numThreads: 0 };
  ort.InferenceSession.create = vi.fn().mockResolvedValue(fakeSession());
  fetchWithProgress.mockReset();
  fetchWithProgress.mockResolvedValue(new ArrayBuffer(8));
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => {
    now += 10;
    return now;
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  globalThis.history.replaceState({}, "", "/scan");
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("loadScanEmbedder", () => {
  it("downloads the model and hands back an embedder", async () => {
    const { loadScanEmbedder } = await loadModule();
    await expect(loadScanEmbedder(MODEL_URL, WASM_PATHS)).resolves.toBeTypeOf("function");
    expect(fetchWithProgress).toHaveBeenCalledWith(
      MODEL_URL,
      expect.any(Function),
      expect.stringContaining(MODEL_URL),
    );
  });

  it("starts the session only once across callers", async () => {
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.InferenceSession.create).toHaveBeenCalledOnce();
  });

  it("points onnxruntime at the wasm binary and nothing else", async () => {
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.wasmPaths).toEqual({ wasm: "/assets/ort.wasm" });
  });

  it("creates the session on the wasm provider with cheap optimization", async () => {
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.InferenceSession.create).toHaveBeenCalledWith(expect.anything(), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "basic",
    });
  });
});

describe("runtime option resolution", () => {
  it("proxies inference off the page's main thread", async () => {
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.proxy).toBe(true);
  });

  it("runs in line when it is already inside the scan worker", async () => {
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS, undefined, true);
    expect(ort.env.wasm.proxy).toBe(false);
  });

  it("lets the URL turn the proxy off", async () => {
    globalThis.history.replaceState({}, "", "/scan?ortProxy=0");
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.proxy).toBe(false);
  });

  it("caps the thread count at four on a wide device", async () => {
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.numThreads).toBe(4);
  });

  it("uses every core on a narrow device", async () => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.numThreads).toBe(2);
  });

  it("falls back to a single thread when the browser reports no cores", async () => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 0, configurable: true });
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.numThreads).toBe(1);
  });

  it("lets the URL override the thread count past the cap", async () => {
    globalThis.history.replaceState({}, "", "/scan?ortThreads=7");
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.numThreads).toBe(7);
  });

  it("ignores a thread override that is not a positive number", async () => {
    globalThis.history.replaceState({}, "", "/scan?ortThreads=nope");
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(ort.env.wasm.numThreads).toBe(4);
  });
});

describe("embedderImageSize", () => {
  it("assumes the shared default before the model is loaded", async () => {
    const { embedderImageSize } = await loadModule();
    expect(embedderImageSize()).toBe(EMBED_IMAGE_SIZE);
  });

  it("reports the size the loaded model actually takes", async () => {
    ort.InferenceSession.create = vi.fn().mockResolvedValue(fakeSession([1, 3, 128, 128]));
    const { loadScanEmbedder, embedderImageSize } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(embedderImageSize()).toBe(128);
  });

  it("falls back to the shared default when the input is not a tensor", async () => {
    const session = fakeSession();
    session.inputMetadata = [{ isTensor: false }];
    ort.InferenceSession.create = vi.fn().mockResolvedValue(session);
    const { loadScanEmbedder, embedderImageSize } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(embedderImageSize()).toBe(EMBED_IMAGE_SIZE);
  });
});

describe("measuredEmbedMsPerImage", () => {
  it("reports nothing before the model is benchmarked", async () => {
    const { measuredEmbedMsPerImage } = await loadModule();
    expect(measuredEmbedMsPerImage()).toBe(0);
  });

  it("divides the benchmark batch's time by its four images", async () => {
    const { loadScanEmbedder, measuredEmbedMsPerImage } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(measuredEmbedMsPerImage()).toBe(2.5);
  });

  it("benchmarks a warm-up batch, a batch of four and a single image", async () => {
    const session = fakeSession();
    ort.InferenceSession.create = vi.fn().mockResolvedValue(session);
    const { loadScanEmbedder } = await loadModule();
    await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    expect(
      session.run.mock.calls.map(
        (call) => (call[0] as { pixel_values: { dims: number[] } }).pixel_values.dims[0],
      ),
    ).toEqual([2, 4, 1]);
  });
});

describe("the embedder it returns", () => {
  it("runs the requested number of images through the session", async () => {
    const session = fakeSession([1, 3, 4, 4]);
    ort.InferenceSession.create = vi.fn().mockResolvedValue(session);
    const { loadScanEmbedder } = await loadModule();
    const embed = await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    session.run.mockClear();
    await embed(new Float32Array(2 * 3 * 16), 2);
    const tensor = (session.run.mock.calls[0]![0] as { pixel_values: { dims: number[] } })
      .pixel_values;
    expect(tensor.dims).toEqual([2, 3, 4, 4]);
  });

  it("copies the pixels so the transfer cannot detach the caller's buffer", async () => {
    const session = fakeSession([1, 3, 4, 4]);
    ort.InferenceSession.create = vi.fn().mockResolvedValue(session);
    const { loadScanEmbedder } = await loadModule();
    const embed = await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    session.run.mockClear();
    const pixels = new Float32Array(4 * 3 * 16);
    await embed(pixels, 1);
    const tensor = (session.run.mock.calls[0]![0] as { pixel_values: { data: Float32Array } })
      .pixel_values;
    expect(tensor.data).not.toBe(pixels);
    expect(tensor.data).toHaveLength(48);
  });

  it("returns the embeddings the session produced", async () => {
    const { loadScanEmbedder } = await loadModule();
    const embed = await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    await expect(embed(new Float32Array(48), 1)).resolves.toEqual(new Float32Array([1, 2, 3]));
  });

  it("reports a session that produced no embeddings", async () => {
    const session = fakeSession();
    session.run.mockResolvedValue({});
    ort.InferenceSession.create = vi.fn().mockResolvedValue(session);
    const { loadScanEmbedder } = await loadModule();
    const embed = await loadScanEmbedder(MODEL_URL, WASM_PATHS);
    await expect(embed(new Float32Array(48), 1)).rejects.toThrow("no image_embeds output");
  });
});

describe("failing to start the encoder", () => {
  it("retries once after a transient failure, refetching the detached model", async () => {
    vi.useFakeTimers();
    ort.InferenceSession.create = vi
      .fn()
      .mockRejectedValueOnce(new Error("memory access out of bounds"))
      .mockResolvedValueOnce(fakeSession());
    const { loadScanEmbedder } = await loadModule();
    const pending = loadScanEmbedder(MODEL_URL, WASM_PATHS);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeTypeOf("function");
    expect(fetchWithProgress).toHaveBeenCalledTimes(2);
  });

  it("gives up without retrying once the backend is gone", async () => {
    ort.InferenceSession.create = vi
      .fn()
      .mockRejectedValue(new Error("no available backend found. ERR: [wasm]"));
    const { loadScanEmbedder } = await loadModule();
    await expect(loadScanEmbedder(MODEL_URL, WASM_PATHS)).rejects.toThrow("no available backend");
    expect(ort.InferenceSession.create).toHaveBeenCalledOnce();
  });

  it("tells the reader to open a fresh tab after an out-of-memory failure", async () => {
    vi.useFakeTimers();
    ort.InferenceSession.create = vi.fn().mockRejectedValue(new Error("Out of memory"));
    const { loadScanEmbedder } = await loadModule();
    const pending = loadScanEmbedder(MODEL_URL, WASM_PATHS);
    const assertion = expect(pending).rejects.toThrow("open this page again in a new tab");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("forgets the failed attempt so a later call can start over", async () => {
    ort.InferenceSession.create = vi
      .fn()
      .mockRejectedValueOnce(new Error("no available backend found"))
      .mockResolvedValueOnce(fakeSession());
    const { loadScanEmbedder } = await loadModule();
    await expect(loadScanEmbedder(MODEL_URL, WASM_PATHS)).rejects.toThrow();
    await expect(loadScanEmbedder(MODEL_URL, WASM_PATHS)).resolves.toBeTypeOf("function");
  });
});

describe("download progress", () => {
  it("paints through the newest caller's callback", async () => {
    let report: ((loaded: number, total: number) => void) | undefined;
    let release: ((buffer: ArrayBuffer) => void) | undefined;
    fetchWithProgress.mockImplementation(
      (_url: string, onProgress: (loaded: number, total: number) => void) => {
        report = onProgress;
        // oxlint-disable-next-line promise/avoid-new -- holding the download open for the test
        return new Promise<ArrayBuffer>((resolve) => {
          release = resolve;
        });
      },
    );
    const { loadScanEmbedder } = await loadModule();
    const first = vi.fn();
    const second = vi.fn();
    const pending = loadScanEmbedder(MODEL_URL, WASM_PATHS, first);
    await vi.waitFor(() => {
      expect(report).toBeDefined();
    });
    const alsoPending = loadScanEmbedder(MODEL_URL, WASM_PATHS, second);
    report!(5, 10);
    expect(second).toHaveBeenCalledWith(5, 10);
    expect(first).not.toHaveBeenCalled();
    release!(new ArrayBuffer(8));
    await Promise.all([pending, alsoPending]);
  });
});
