import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithProgress = vi.hoisted(() => vi.fn());

vi.mock("@/lib/fetch-progress", () => ({ fetchWithProgress }));

interface EmscriptenModule {
  locateFile: (file: string) => string;
}

function fakeCv(): Record<string, unknown> {
  const cv: Record<string, unknown> = {};
  // oxlint-disable-next-line unicorn/no-thenable -- the emscripten export being faked is exactly that hazard, and the loader exists to defuse it
  cv.then = (resolve: (value: unknown) => void): void => {
    resolve(cv);
  };
  return cv;
}

// A timed-out test strands the loader mid-flight, stripping `then` off the
// next test's `globalThis.cv` and failing it too, so this suite runs with
// extra headroom above the 5s default.
describe("loadOpenCv", { timeout: 30_000 }, () => {
  let appended: HTMLScriptElement[];
  let moduleDuringEval: EmscriptenModule | undefined;
  let respondWith: "load" | "error";

  beforeEach(() => {
    // The loader caches its promise in a module-level slot; each test needs a fresh copy.
    vi.resetModules();
    appended = [];
    moduleDuringEval = undefined;
    respondWith = "load";
    fetchWithProgress.mockReset();
    fetchWithProgress.mockImplementation(
      (_url: string, onProgress?: (loaded: number, total: number) => void) => {
        onProgress?.(64, 128);
        return Promise.resolve(new ArrayBuffer(8));
      },
    );
    // jsdom never fetches or evaluates a script tag's src; drive load/error by hand.
    vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
      for (const node of nodes) {
        const script = node as HTMLScriptElement;
        appended.push(script);
        moduleDuringEval = (globalThis as { Module?: EmscriptenModule }).Module;
        if (respondWith === "load") {
          (globalThis as { cv?: unknown }).cv = fakeCv();
        }
        script.dispatchEvent(new Event(respondWith));
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { cv?: unknown }).cv;
    delete (globalThis as { Module?: unknown }).Module;
  });

  it("evaluates the script from its own URL, not from a blob", async () => {
    const { loadOpenCv } = await import("./scan-opencv");

    await loadOpenCv("/media/scan/scan-opencv-v1.js");

    // The served CSP has no `blob:` in script-src, so the tag must point at the real asset.
    expect(appended).toHaveLength(1);
    expect(appended[0]?.getAttribute("src")).toBe("/media/scan/scan-opencv-v1.js");
    expect(appended[0]?.src.startsWith("blob:")).toBe(false);
  });

  it("points the wasm at the sibling file the script is served under", async () => {
    const { loadOpenCv } = await import("./scan-opencv");

    await loadOpenCv("/media/scan/scan-opencv-v1.js");

    expect(moduleDuringEval?.locateFile("opencv_js.wasm")).toBe("/media/scan/scan-opencv-v1.wasm");
    expect((globalThis as { Module?: unknown }).Module).toBeUndefined();
  });

  it("reports download progress", async () => {
    const { loadOpenCv } = await import("./scan-opencv");
    const onProgress = vi.fn();

    await loadOpenCv("/media/scan/scan-opencv-v1.js", onProgress);

    expect(onProgress).toHaveBeenCalledWith(64, 128);
  });

  it("resolves with the module the glue exports", async () => {
    const { loadOpenCv } = await import("./scan-opencv");

    const cv = await loadOpenCv("/media/scan/scan-opencv-v1.js");

    expect(cv).toBe((globalThis as { cv?: unknown }).cv);
    expect("then" in cv).toBe(false);
  });

  it("loads once per page and retries after a failure", async () => {
    const { loadOpenCv } = await import("./scan-opencv");

    respondWith = "error";
    await expect(loadOpenCv("/media/scan/scan-opencv-v1.js")).rejects.toThrow(
      "The OpenCV script failed to evaluate",
    );

    respondWith = "load";
    await loadOpenCv("/media/scan/scan-opencv-v1.js");
    await loadOpenCv("/media/scan/scan-opencv-v1.js");

    expect(fetchWithProgress).toHaveBeenCalledTimes(2);
    expect(appended).toHaveLength(2);
  });
});

describe("loadOpenCvInWorker", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchWithProgress.mockReset();
  });

  afterEach(() => {
    delete (globalThis as { cv?: unknown }).cv;
    delete (globalThis as { Module?: unknown }).Module;
  });

  function serveSource(source: string): void {
    fetchWithProgress.mockImplementation(
      (_url: string, onProgress?: (loaded: number, total: number) => void) => {
        const bytes = new TextEncoder().encode(source);
        onProgress?.(bytes.byteLength, bytes.byteLength);
        return Promise.resolve(bytes.buffer);
      },
    );
  }

  it("evaluates the downloaded glue and unwraps the thenable it exports", async () => {
    const { loadOpenCvInWorker } = await import("./scan-opencv");
    serveSource(
      `globalThis.cv = { locate: globalThis.Module.locateFile("opencv_js.wasm"), then(resolve) { resolve(this); } };`,
    );

    const cv = (await loadOpenCvInWorker("/media/scan/scan-opencv-v1.js")) as unknown as {
      locate: string;
    };

    expect(cv.locate).toBe("/media/scan/scan-opencv-v1.wasm");
    expect("then" in cv).toBe(false);
    expect((globalThis as { Module?: unknown }).Module).toBeUndefined();
  });

  it("reports download progress", async () => {
    const { loadOpenCvInWorker } = await import("./scan-opencv");
    serveSource(`globalThis.cv = { then(resolve) { resolve(this); } };`);
    const onProgress = vi.fn();

    await loadOpenCvInWorker("/media/scan/scan-opencv-v1.js", onProgress);

    expect(onProgress).toHaveBeenCalled();
  });

  it("names the media/scan repair when the download fails", async () => {
    const { loadOpenCvInWorker } = await import("./scan-opencv");
    fetchWithProgress.mockImplementation((_url: string, _onProgress: unknown, hint: string) =>
      Promise.reject(new Error(hint)),
    );

    await expect(loadOpenCvInWorker("/media/scan/scan-opencv-v1.js")).rejects.toThrow(
      "/admin/scan",
    );
  });

  it("never points at a local export script", async () => {
    const { loadOpenCvInWorker } = await import("./scan-opencv");
    fetchWithProgress.mockImplementation((_url: string, _onProgress: unknown, hint: string) =>
      Promise.reject(new Error(hint)),
    );

    await expect(loadOpenCvInWorker("/media/scan/scan-opencv-v1.js")).rejects.not.toThrow(
      "export-index",
    );
  });
});
