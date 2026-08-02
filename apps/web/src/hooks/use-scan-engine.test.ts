import type { CardEmbedder, OpenCvLike, OrbCvLike } from "@openrift/shared/scan";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ScanEmbedderModule from "@/lib/scan-embedder";
import { loadScanEmbedder, measuredEmbedMsPerImage } from "@/lib/scan-embedder";
import { loadOpenCv } from "@/lib/scan-opencv";

import type { ScanEngineAssets } from "./use-scan-engine";
import { errorMessage, useScanEngine } from "./use-scan-engine";

vi.mock("@/lib/scan-opencv", () => ({
  loadOpenCv: vi.fn(),
}));

vi.mock("@/lib/scan-embedder", async (importOriginal) => {
  const actual = await importOriginal<typeof ScanEmbedderModule>();
  return {
    ...actual,
    loadScanEmbedder: vi.fn(),
    measuredEmbedMsPerImage: vi.fn(),
  };
});

const FAKE_CV = { kind: "fake-cv" } as unknown as OpenCvLike & OrbCvLike;
const FAKE_EMBEDDER: CardEmbedder = () => Promise.resolve(new Float32Array(0));

const ASSETS: ScanEngineAssets = {
  encoderUrl: "https://assets.invalid/encoder.onnx",
  opencvUrl: "https://assets.invalid/opencv.js",
};

describe("errorMessage", () => {
  it("returns the message of a thrown Error", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns the fallback for a non-Error throw", () => {
    expect(errorMessage("a string", "fallback")).toBe("fallback");
  });
});

describe("useScanEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadOpenCv).mockImplementation(async (_url, onProgress) => {
      onProgress?.(500, 1000);
      return FAKE_CV;
    });
    vi.mocked(loadScanEmbedder).mockImplementation(async (_url, _paths, onProgress) => {
      onProgress?.(10, 20);
      return FAKE_EMBEDDER;
    });
    vi.mocked(measuredEmbedMsPerImage).mockReturnValue(80);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads both halves, exposing them through the refs with progress and readiness", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useScanEngine(ASSETS, onError));

    await waitFor(() => {
      expect(result.current.cvReady).toBe(true);
      expect(result.current.embedderReady).toBe(true);
    });

    expect(result.current.cvRef.current).toBe(FAKE_CV);
    expect(result.current.embedderRef.current).toBe(FAKE_EMBEDDER);
    expect(result.current.workerRef.current).toBeNull();
    expect(result.current.embedMsPerImage).toBe(80);
    expect(result.current.engineProgress).toEqual({
      opencv: { loaded: 500, total: 1000, ready: true },
      encoder: { loaded: 10, total: 20, ready: true },
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("waits for the asset manifest before downloading anything", () => {
    renderHook(() => useScanEngine(null, vi.fn()));

    expect(loadOpenCv).not.toHaveBeenCalled();
    expect(loadScanEmbedder).not.toHaveBeenCalled();
  });

  it("reports an OpenCV load failure without blocking the encoder", async () => {
    vi.mocked(loadOpenCv).mockRejectedValue(new Error("wasm refused to instantiate"));
    const onError = vi.fn();
    const { result } = renderHook(() => useScanEngine(ASSETS, onError));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("wasm refused to instantiate");
    });
    expect(result.current.cvReady).toBe(false);
    await waitFor(() => {
      expect(result.current.embedderReady).toBe(true);
    });
  });

  it("reports an encoder load failure, with the fallback for a non-Error throw", async () => {
    vi.mocked(loadScanEmbedder).mockRejectedValue("wire unplugged");
    const onError = vi.fn();
    const { result } = renderHook(() => useScanEngine(ASSETS, onError));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Could not load the encoder model");
    });
    expect(result.current.embedderReady).toBe(false);
  });
});
