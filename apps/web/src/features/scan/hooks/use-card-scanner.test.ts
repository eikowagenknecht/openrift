/**
 * Characterisation tests for the scanner hook, faked only at its true
 * boundaries (OpenCV, encoder, camera, canvas, frame scheduler) so the real
 * session config and shared engine run underneath. Reference images carry an
 * identity through a WeakMap keyed by their pixel array, following the
 * harness in `packages/shared/src/scan/session.test.ts`.
 */
import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import type { CardEmbedder, EmbedBank } from "@openrift/shared/scan/embed";
import type { OrbCvLike } from "@openrift/shared/scan/orb";
import type { RgbaImage } from "@openrift/shared/scan/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as CameraInfoModule from "@/features/scan/lib/camera-info";
import type { CameraInfo } from "@/features/scan/lib/camera-info";
import { readCameraInfo } from "@/features/scan/lib/camera-info";
import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import type { IdentifyAttempt } from "@/features/scan/lib/scan-catchup";
import type * as ScanEmbedderModule from "@/features/scan/lib/scan-embedder";
import { loadScanEmbedder, measuredEmbedMsPerImage } from "@/features/scan/lib/scan-embedder";
import type { LockedCard } from "@/features/scan/lib/scan-locks";
import { loadOpenCv } from "@/features/scan/lib/scan-opencv";
import { GUIDE_COLOR, RETICLE_COLOR } from "@/features/scan/lib/scan-overlay";
import { fetchReference } from "@/features/scan/lib/scan-reference-image";
import type { ScannerSettings } from "@/features/scan/lib/scan-session";
import { DEFAULT_SCANNER_SETTINGS } from "@/features/scan/lib/scan-session";

import { useCardScanner } from "./use-card-scanner";

vi.mock("@/features/scan/lib/scan-opencv", () => ({
  loadOpenCv: vi.fn(),
}));

vi.mock("@/features/scan/lib/scan-embedder", async (importOriginal) => {
  const actual = await importOriginal<typeof ScanEmbedderModule>();
  return {
    ...actual,
    loadScanEmbedder: vi.fn(),
    measuredEmbedMsPerImage: vi.fn(),
  };
});

vi.mock("@/features/scan/lib/scan-reference-image", () => ({
  fetchReference: vi.fn(),
}));

vi.mock("@/features/scan/lib/camera-info", async (importOriginal) => {
  const actual = await importOriginal<typeof CameraInfoModule>();
  return {
    ...actual,
    readCameraInfo: vi.fn(),
  };
});

const imageTags = new WeakMap<ArrayLike<number>, string>();

/** Stand-in for OpenCV's Size, Rect and Scalar, none of which is read back. */
class Geometry {
  readonly args: number[];

  constructor(...args: number[]) {
    this.args = args;
  }
}

const STUB_MATCHES = 20;

function taggedReference(tag: string): RgbaImage {
  const data = new Uint8ClampedArray(8 * 11 * 4);
  data.fill(200);
  for (let index = 3; index < data.length; index += 4) {
    data[index] = 255;
  }
  imageTags.set(data, tag);
  return { data, width: 8, height: 11 };
}

/**
 * A fake OpenCV reporting the test-chosen inlier count for whichever
 * reference is verified. Both detectors report zero contours, so a guide
 * session always falls through to the guide candidate.
 */
function createStubCv(inliersFor: (tag: string | undefined) => number): OpenCvLike & OrbCvLike {
  let lastReferenceTag: string | undefined;

  class Mat {
    rows = 0;
    tag: string | undefined;
    data: Uint8Array;

    constructor() {
      this.data = this.taggedBuffer(0);
    }

    static zeros(): Mat {
      return new Mat();
    }

    taggedBuffer(size: number): Uint8Array {
      const buffer = new Uint8Array(size);
      buffer.set = (values: ArrayLike<number>) => {
        this.tag = imageTags.get(values);
      };
      return buffer;
    }

    fillInliers(count: number): void {
      this.rows = count;
      this.data = new Uint8Array(count).fill(1);
    }

    roi(): Mat {
      return new Mat();
    }

    setTo(): void {}

    empty(): boolean {
      return false;
    }

    delete(): void {}
  }

  class MatVector {
    size(): number {
      return 0;
    }

    get(): Mat {
      return new Mat();
    }

    delete(): void {}
  }

  class KeyPointVector {
    get(index: number): { pt: { x: number; y: number } } {
      return { pt: { x: index, y: index } };
    }

    delete(): void {}
  }

  class Orb {
    detectAndCompute(image: Mat, _mask: Mat, _keypoints: KeyPointVector, descriptors: Mat): void {
      // Above verifyOrb's 8-row floor, carrying the source image's identity.
      descriptors.rows = 16;
      descriptors.tag = image.tag;
    }

    delete(): void {}
  }

  class BfMatcher {
    knnMatch(_query: Mat, train: Mat, _out: unknown, _k: number): void {
      lastReferenceTag = train.tag;
    }

    delete(): void {}
  }

  class DMatchVectorVector {
    size(): number {
      return STUB_MATCHES;
    }

    /** Distances 1 vs 10 always clear Lowe's ratio test. */
    get(index: number) {
      return {
        size: () => 2,
        get: (which: number) => ({
          distance: which === 0 ? 1 : 10,
          queryIdx: index,
          trainIdx: index,
        }),
        delete: () => {},
      };
    }

    delete(): void {}
  }

  const cv = {
    Mat,
    MatVector,
    KeyPointVector,
    ORB: Orb,
    BFMatcher: BfMatcher,
    DMatchVectorVector,
    Size: Geometry,
    Rect: Geometry,
    Scalar: Geometry,
    RotatedRect: { points: () => [] },
    CV_8UC1: 0,
    CV_8UC4: 24,
    CV_32FC2: 13,
    COLOR_RGBA2GRAY: 11,
    MORPH_RECT: 0,
    MORPH_CLOSE: 3,
    ADAPTIVE_THRESH_GAUSSIAN_C: 1,
    THRESH_BINARY: 0,
    THRESH_BINARY_INV: 1,
    THRESH_OTSU: 8,
    RETR_LIST: 1,
    CHAIN_APPROX_SIMPLE: 2,
    NORM_HAMMING: 6,
    RANSAC: 8,
    cvtColor: (source: Mat, destination: Mat) => {
      destination.tag = source.tag;
    },
    equalizeHist: (source: Mat, destination: Mat) => {
      destination.tag = source.tag;
    },
    resize: () => {},
    medianBlur: () => {},
    GaussianBlur: () => {},
    adaptiveThreshold: () => {},
    threshold: () => {},
    getStructuringElement: () => new Mat(),
    morphologyEx: () => {},
    findContours: () => {},
    contourArea: () => 0,
    minAreaRect: () => ({ center: { x: 0, y: 0 }, size: { width: 0, height: 0 }, angle: 0 }),
    matFromArray: () => new Mat(),
    findHomography: (_source: Mat, _destination: Mat, _method: number, _t: number, mask: Mat) => {
      mask.fillInliers(inliersFor(lastReferenceTag));
      return new Mat();
    },
  };

  return cv as unknown as OpenCvLike & OrbCvLike;
}

function createBank(distances: Record<string, number>): EmbedBank {
  const bank: EmbedBank = { keys: Object.keys(distances), vectors: new Float32Array(0) };
  bank.vectors = new Float32Array(bank.keys.length * 2);
  setDistances(bank, distances);
  return bank;
}

/** Rewrites a bank's distances in place, so a running session sees the change on its next frame. */
function setDistances(bank: EmbedBank, distances: Record<string, number>): void {
  bank.keys.forEach((key, index) => {
    const cosine = 1 - (distances[key] ?? 2);
    bank.vectors[index * 2] = cosine;
    bank.vectors[index * 2 + 1] = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  });
}

/** When set, every embed call rejects with this message. */
let embedFailure: string | null = null;

function createEmbedder(): CardEmbedder {
  return (_pixels, count) => {
    if (embedFailure !== null) {
      return Promise.reject(new Error(embedFailure));
    }
    const out = new Float32Array(count * 2);
    for (let slot = 0; slot < count; slot++) {
      out[slot * 2] = 1;
    }
    return Promise.resolve(out);
  };
}

/** Callbacks parked until the test pumps them, so loops advance on demand. */
let rafQueue: FrameRequestCallback[] = [];

function pumpAnimationFrames(): void {
  const callbacks = rafQueue;
  rafQueue = [];
  for (const callback of callbacks) {
    callback(nowMs);
  }
}

/** The spied `performance.now` clock, advanced explicitly per frame. */
let nowMs = 0;

function advance(ms: number): void {
  nowMs += ms;
}

/** Per-call scene identity: bump to make the fake camera show a new scene. */
let sceneSeed = 0;

/**
 * Deterministic per-size noise sharp enough to pass the real `minFocus`
 * gate; the same size and seed always produce the same pixels, so
 * consecutive frames present as a static scene to the placement watcher.
 */
function scenePixels(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = 1_234_567 + sceneSeed * 7919;
  for (let index = 0; index < data.length; index += 4) {
    state = (state * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
    const value = state % 256;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return data;
}

const fakeContexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
const strokes: { canvas: HTMLCanvasElement; style: string; dash: number[] }[] = [];

/** Solid strokes only: the lock ring is dashed, the brackets are not. */
function solidStrokeStyles(canvas: HTMLCanvasElement): string[] {
  return strokes
    .filter((stroke) => stroke.canvas === canvas && stroke.dash.length === 0)
    .map((stroke) => stroke.style);
}

/**
 * A permissive fake 2d context: known reads are answered, everything else is
 * a cached no-op; `getImageData` serves the current fake scene.
 */
function fakeContextFor(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const existing = fakeContexts.get(canvas);
  if (existing) {
    return existing;
  }
  let dash: number[] = [];
  const backing: Record<string | symbol, unknown> = {
    canvas,
    setLineDash: (next: number[]) => {
      dash = next;
    },
    stroke: () => {
      const style = backing.strokeStyle;
      strokes.push({ canvas, style: typeof style === "string" ? style : "", dash: [...dash] });
    },
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: scenePixels(width, height),
      width,
      height,
    }),
    measureText: () => ({ width: 0 }),
  };
  const context = new Proxy(backing, {
    get(target, property) {
      if (!(property in target)) {
        target[property] = () => {};
      }
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  fakeContexts.set(canvas, context);
  return context;
}

interface FakeStream {
  stream: MediaStream;
  tracks: { stop: ReturnType<typeof vi.fn> }[];
}

function createFakeStream(): FakeStream {
  const tracks = [{ stop: vi.fn() }];
  return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

function stubGetUserMedia(
  implementation: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(implementation);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
  return getUserMedia;
}

/** Fixed dimensions and a writable `srcObject`; jsdom's video element supports neither natively. */
function createFakeVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", { value: 640, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: 480, configurable: true });
  Object.defineProperty(video, "srcObject", { value: null, writable: true, configurable: true });
  video.play = vi.fn(() => Promise.resolve());
  return video;
}

/**
 * One macrotask hop, which flushes every pending microtask that the frame
 * pipeline's internal awaits need to run to completion.
 */
function flushAsync(): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping the setTimeout callback API to await a macrotask boundary
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new, promise/param-names -- a hand-rolled deferred exists to expose the executor's settle functions
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FAKE_CAMERA_INFO: CameraInfo = {
  devices: [],
  label: "Fake rear camera",
  settings: [],
  capabilities: [],
  capabilitiesSupported: false,
};

/** The inlier count the fake verifier reports, swappable mid-test. */
let currentInliers: (tag: string | undefined) => number = () => 0;
/** The bank the mounted hook ranks against, distances rewritable in place. */
let bankState: EmbedBank;

function loadedBank(): LoadedScanBank {
  return {
    bank: bankState,
    artKeys: new Map([["k-a", "art-a"]]),
    labels: { "k-a": { name: "Lux", code: "OGN-001", language: "en" } },
    bytes: 1024,
    canonical: true,
  };
}

function cardPresent(): void {
  setDistances(bankState, { "k-a": 0.05 });
  currentInliers = () => 40;
}

function cardAbsent(): void {
  setDistances(bankState, { "k-a": 0.9 });
  currentInliers = () => 0;
}

interface MountOptions {
  settings?: ScannerSettings;
  loaded?: LoadedScanBank | null;
}

async function mountScanner(options: MountOptions = {}) {
  const onLock = vi.fn<(lock: LockedCard) => void>();
  const hook = renderHook(() =>
    useCardScanner(
      options.loaded === undefined ? loadedBank() : options.loaded,
      options.settings ?? DEFAULT_SCANNER_SETTINGS,
      {
        encoderUrl: "https://assets.invalid/encoder.onnx",
        opencvUrl: "https://assets.invalid/opencv.js",
      },
      { onLock },
    ),
  );
  const video = createFakeVideo();
  const overlay = document.createElement("canvas");
  hook.result.current.videoRef.current = video;
  hook.result.current.overlayRef.current = overlay;
  return { hook, video, overlay, onLock };
}

async function mountReadyScanner(options: MountOptions = {}) {
  const mounted = await mountScanner(options);
  await waitFor(() => {
    expect(mounted.hook.result.current.cvReady).toBe(true);
    expect(mounted.hook.result.current.embedderReady).toBe(true);
  });
  return mounted;
}

/**
 * Pumps `count` frame iterations, advancing the clock past the publish
 * throttle each time so every processed frame reaches the readout.
 */
async function runFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    advance(200);
    await act(async () => {
      pumpAnimationFrames();
      await flushAsync();
      await flushAsync();
    });
  }
}

/**
 * One camera-rate tick: the placement watcher, the painter and the frame
 * loop each run once. A short clock step, so a disturbance stays trusted
 * between ticks.
 */
async function pumpCameraFrame(): Promise<void> {
  advance(100);
  await act(async () => {
    pumpAnimationFrames();
    await flushAsync();
    await flushAsync();
  });
}

/**
 * Deals an unrecognised card through baseline, disturbance and settle
 * frames, then past the miss grace window. The next tick after this books
 * the miss and frees the catch-up slot.
 */
async function landUnrecognisedCard(): Promise<void> {
  await pumpCameraFrame();
  for (const seed of [1, 2, 3]) {
    sceneSeed = seed;
    await pumpCameraFrame();
  }
  await pumpCameraFrame();
  await pumpCameraFrame();
  advance(4100);
}

/**
 * Another copy landing in the guide: the scene changes for a few frames
 * then holds still, which the placement watcher treats as a card dealt
 * onto the pile.
 */
async function dealAnotherCopy(): Promise<void> {
  for (const seed of [11, 12, 13]) {
    sceneSeed = seed;
    await pumpCameraFrame();
  }
  await pumpCameraFrame();
  await pumpCameraFrame();
}

describe("useCardScanner", () => {
  beforeEach(() => {
    nowMs = 10_000;
    sceneSeed = 0;
    rafQueue = [];
    strokes.length = 0;
    bankState = createBank({ "k-a": 0.9 });
    currentInliers = () => 0;
    embedFailure = null;

    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    // The per-frame [scan] diagnostics would drown the test output.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function fakeGetContext(
      this: HTMLCanvasElement,
    ) {
      return fakeContextFor(this);
    } as unknown as typeof HTMLCanvasElement.prototype.getContext);
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,fake";

    vi.mocked(loadOpenCv).mockImplementation(async (_url, onProgress) => {
      onProgress?.(500, 1000);
      return createStubCv((tag) => currentInliers(tag));
    });
    vi.mocked(loadScanEmbedder).mockImplementation(async (_url, _paths, onProgress) => {
      onProgress?.(10, 20);
      return createEmbedder();
    });
    vi.mocked(measuredEmbedMsPerImage).mockReturnValue(80);
    vi.mocked(fetchReference).mockImplementation((key) => Promise.resolve(taggedReference(key)));
    vi.mocked(readCameraInfo).mockResolvedValue(FAKE_CAMERA_INFO);
    stubGetUserMedia(() => Promise.resolve(createFakeStream().stream));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rafQueue = [];
  });

  describe("engine loading", () => {
    it("reports download progress and readiness for both engine halves", async () => {
      const { hook } = await mountReadyScanner();

      expect(hook.result.current.engineProgress.opencv).toEqual({
        loaded: 500,
        total: 1000,
        ready: true,
      });
      expect(hook.result.current.engineProgress.encoder).toEqual({
        loaded: 10,
        total: 20,
        ready: true,
      });
      expect(hook.result.current.embedMsPerImage).toBe(80);
      expect(hook.result.current.deviceTooSlow).toBe(false);
      expect(hook.result.current.error).toBeNull();
    });

    it("surfaces an OpenCV load failure as the hook error", async () => {
      vi.mocked(loadOpenCv).mockRejectedValue(new Error("wasm refused to instantiate"));

      const { hook } = await mountScanner();

      await waitFor(() => {
        expect(hook.result.current.error).toBe("wasm refused to instantiate");
      });
      expect(hook.result.current.cvReady).toBe(false);
    });

    it("surfaces an encoder load failure as the hook error", async () => {
      vi.mocked(loadScanEmbedder).mockRejectedValue(new Error("encoder download failed"));

      const { hook } = await mountScanner();

      await waitFor(() => {
        expect(hook.result.current.error).toBe("encoder download failed");
      });
      expect(hook.result.current.embedderReady).toBe(false);
    });

    it("flags a device whose measured encoder cost crosses the slow floor", async () => {
      vi.mocked(measuredEmbedMsPerImage).mockReturnValue(300);

      const { hook } = await mountReadyScanner();

      expect(hook.result.current.embedMsPerImage).toBe(300);
      expect(hook.result.current.deviceTooSlow).toBe(true);
    });
  });

  describe("start and stop", () => {
    it("opens the camera, attaches the stream and flips active; stop reverses all of it", async () => {
      const fake = createFakeStream();
      const getUserMedia = stubGetUserMedia(() => Promise.resolve(fake.stream));
      const { hook, video } = await mountReadyScanner();

      await act(async () => {
        await hook.result.current.start();
      });

      expect(getUserMedia).toHaveBeenCalledTimes(1);
      // A fast device gets no frame rate cap.
      expect(getUserMedia.mock.calls[0]![0]).toEqual({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      expect(video.play).toHaveBeenCalledTimes(1);
      expect(video.srcObject).toBe(fake.stream);
      expect(hook.result.current.active).toBe(true);
      expect(hook.result.current.error).toBeNull();

      act(() => {
        hook.result.current.stop();
      });

      expect(hook.result.current.active).toBe(false);
      expect(fake.tracks[0]!.stop).toHaveBeenCalled();
      expect(video.srcObject).toBeNull();
    });

    it("refuses to start before the engine is ready, without touching the camera", async () => {
      // oxlint-disable-next-line promise/avoid-new -- deliberately never-settling load to hold the engine in its loading state
      vi.mocked(loadOpenCv).mockImplementation(() => new Promise(() => {}));
      const getUserMedia = stubGetUserMedia(() => Promise.resolve(createFakeStream().stream));
      const { hook } = await mountScanner();

      await act(async () => {
        await hook.result.current.start();
      });

      expect(hook.result.current.error).toBe("The engine is still loading, try again in a moment.");
      expect(hook.result.current.active).toBe(false);
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it("refuses to start while the card bank has not loaded", async () => {
      const getUserMedia = stubGetUserMedia(() => Promise.resolve(createFakeStream().stream));
      const { hook } = await mountReadyScanner({ loaded: null });

      await act(async () => {
        await hook.result.current.start();
      });

      expect(hook.result.current.error).toBe("The engine is still loading, try again in a moment.");
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it("maps a denied camera to the user-facing message and allows a retry", async () => {
      const getUserMedia = stubGetUserMedia(() =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
      );
      const { hook } = await mountReadyScanner();

      await act(async () => {
        await hook.result.current.start();
      });

      expect(hook.result.current.error).toBe(
        "Camera access was blocked. Allow camera access for this site in your browser settings and try again.",
      );
      expect(hook.result.current.active).toBe(false);

      getUserMedia.mockImplementation(() => Promise.resolve(createFakeStream().stream));
      await act(async () => {
        await hook.result.current.start();
      });

      expect(hook.result.current.active).toBe(true);
      expect(hook.result.current.error).toBeNull();
    });

    it("retries without the frame rate cap when a slow device's capped request is overconstrained", async () => {
      vi.mocked(measuredEmbedMsPerImage).mockReturnValue(300);
      const fake = createFakeStream();
      const getUserMedia = stubGetUserMedia(
        vi
          .fn()
          .mockRejectedValueOnce(new DOMException("no mode fits", "OverconstrainedError"))
          .mockResolvedValueOnce(fake.stream),
      );
      const { hook } = await mountReadyScanner();

      await act(async () => {
        await hook.result.current.start();
      });

      expect(getUserMedia).toHaveBeenCalledTimes(2);
      const first = getUserMedia.mock.calls[0]![0] as { video: MediaTrackConstraints };
      const second = getUserMedia.mock.calls[1]![0] as { video: MediaTrackConstraints };
      expect(first.video.frameRate).toEqual({ max: 30 });
      expect(second.video.frameRate).toBeUndefined();
      expect(hook.result.current.active).toBe(true);
    });

    it("stops the opened tracks when the preview refuses to play", async () => {
      const fake = createFakeStream();
      stubGetUserMedia(() => Promise.resolve(fake.stream));
      const { hook, video } = await mountReadyScanner();
      video.play = vi.fn(() => Promise.reject(new Error("autoplay blocked")));

      await act(async () => {
        await hook.result.current.start();
      });

      expect(hook.result.current.error).toBe("autoplay blocked");
      expect(hook.result.current.active).toBe(false);
      expect(fake.tracks[0]!.stop).toHaveBeenCalled();
    });

    it("opens the camera once for two overlapping start calls", async () => {
      const opened = deferred<MediaStream>();
      const getUserMedia = stubGetUserMedia(() => opened.promise);
      const { hook } = await mountReadyScanner();

      let firstStart!: Promise<void>;
      let secondStart!: Promise<void>;
      act(() => {
        firstStart = hook.result.current.start();
        secondStart = hook.result.current.start();
      });
      opened.resolve(createFakeStream().stream);
      await act(async () => {
        await Promise.all([firstStart, secondStart]);
      });

      expect(getUserMedia).toHaveBeenCalledTimes(1);
      expect(hook.result.current.active).toBe(true);
    });

    it("shuts a stream opened after stop bumped the run generation", async () => {
      const opened = deferred<MediaStream>();
      stubGetUserMedia(() => opened.promise);
      const fake = createFakeStream();
      const { hook, video } = await mountReadyScanner();

      let startPromise!: Promise<void>;
      act(() => {
        startPromise = hook.result.current.start();
      });
      act(() => {
        hook.result.current.stop();
      });
      opened.resolve(fake.stream);
      await act(async () => {
        await startPromise;
      });

      expect(fake.tracks[0]!.stop).toHaveBeenCalled();
      expect(hook.result.current.active).toBe(false);
      expect(video.srcObject).toBeNull();
      expect(video.play).not.toHaveBeenCalled();
    });

    it("shuts a stream opened after the page unmounted mid-start", async () => {
      const opened = deferred<MediaStream>();
      stubGetUserMedia(() => opened.promise);
      const fake = createFakeStream();
      const { hook } = await mountReadyScanner();

      let startPromise!: Promise<void>;
      act(() => {
        startPromise = hook.result.current.start();
      });
      hook.unmount();
      opened.resolve(fake.stream);
      await act(async () => {
        await startPromise;
      });

      expect(fake.tracks[0]!.stop).toHaveBeenCalled();
    });

    it("keeps the camera report readable after stop", async () => {
      const { hook } = await mountReadyScanner();

      await act(async () => {
        await hook.result.current.start();
      });
      await act(async () => {
        await flushAsync();
      });
      act(() => {
        hook.result.current.stop();
      });

      expect(hook.result.current.cameraInfo).toEqual(FAKE_CAMERA_INFO);
    });
  });

  describe("frame loop and readout", () => {
    it("publishes a readout for winner-less frames over an empty guide", async () => {
      cardAbsent();
      const { hook } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      await runFrames(2);

      const readout = hook.result.current.readout;
      expect(readout.fps).toBeGreaterThan(0);
      expect(readout.winnerKey).toBeNull();
      // An empty guide's far-ranked junk must not present as aiming at a card.
      expect(readout.aim).toBeNull();
      expect(readout.locks).toEqual([]);
      // The guide session always proposes the guide rect itself.
      expect(readout.candidate).not.toBeNull();
    });

    it("brackets the card only once a frame verifies it", async () => {
      cardAbsent();
      const { hook, overlay } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      await runFrames(2);

      // The guide session proposes the guide rect on every empty frame; that
      // proposal is not evidence of a card and must not draw brackets.
      expect(new Set(solidStrokeStyles(overlay))).toEqual(new Set([GUIDE_COLOR]));

      cardPresent();
      await runFrames(2);

      expect(solidStrokeStyles(overlay)).toContain(RETICLE_COLOR);
    });

    it("locks a recognised card, reports it and publishes the lock", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      await runFrames(6);

      expect(onLock).toHaveBeenCalledTimes(1);
      const lock = onLock.mock.calls[0]![0];
      expect(lock.key).toBe("k-a");
      expect(lock.artKey).toBe("art-a");
      expect(lock.label).toBe("Lux (OGN-001 en)");
      // A single-render artwork gives the disambiguation stage nothing to run
      // on, so the lock reports unresolved.
      expect(lock.resolved).toBe(false);
      const readout = hook.result.current.readout;
      expect(readout.locks).toHaveLength(1);
      expect(readout.locks[0]!.key).toBe("k-a");
      expect(readout.winnerKey).toBe("k-a");
      expect(readout.aim?.artKey).toBe("art-a");
      expect(readout.candidateAreaFraction).toBeGreaterThan(0.5);
    });

    it("drops a frame that was in flight when stop bumped the generation", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      advance(200);
      await act(async () => {
        pumpAnimationFrames();
        hook.result.current.stop();
        await flushAsync();
        await flushAsync();
      });

      expect(hook.result.current.readout.fps).toBe(0);
      expect(hook.result.current.readout.winnerKey).toBeNull();
      expect(onLock).not.toHaveBeenCalled();
    });

    it("reports a failed frame and keeps the loop alive", async () => {
      cardAbsent();
      const { hook } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      embedFailure = "encoder backend crashed";
      await runFrames(1);

      expect(hook.result.current.error).toBe("encoder backend crashed");

      embedFailure = null;
      await runFrames(2);

      expect(hook.result.current.readout.fps).toBeGreaterThan(0);
    });

    it("clears locks and the readout on clearHistory", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });
      await runFrames(6);
      expect(onLock).toHaveBeenCalled();

      act(() => {
        hook.result.current.clearHistory();
      });

      expect(hook.result.current.readout.locks).toEqual([]);
      expect(hook.result.current.readout.winnerKey).toBeNull();
      expect(hook.result.current.readout.fps).toBe(0);
    });
  });

  describe("capture mode", () => {
    const captureSettings: ScannerSettings = { ...DEFAULT_SCANNER_SETTINGS, mode: "capture" };

    it("keeps the pipeline idle until a tap, then locks on one verified frame", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner({ settings: captureSettings });
      await act(async () => {
        await hook.result.current.start();
      });

      await runFrames(3);
      expect(hook.result.current.readout.fps).toBe(0);
      expect(onLock).not.toHaveBeenCalled();

      advance(200);
      await act(async () => {
        await hook.result.current.capture();
      });

      expect(onLock).toHaveBeenCalledTimes(1);
      expect(hook.result.current.readout.winnerKey).toBe("k-a");
      // A tapped lock times just the single tap's processing.
      expect(onLock.mock.calls[0]![0].framesToLock).toBe(1);
    });

    it("ignores a second tap while the first is still processing", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner({ settings: captureSettings });
      await act(async () => {
        await hook.result.current.start();
      });

      advance(200);
      let firstTap!: Promise<void>;
      let secondTap!: Promise<void>;
      act(() => {
        firstTap = hook.result.current.capture();
        secondTap = hook.result.current.capture();
      });
      await act(async () => {
        await Promise.all([firstTap, secondTap]);
        await flushAsync();
      });

      expect(onLock).toHaveBeenCalledTimes(1);
    });
  });

  describe("placement watcher and catch-up", () => {
    const autoMode = { settings: { ...DEFAULT_SCANNER_SETTINGS, mode: "auto" as const } };

    it("offers a missed placement back as an unidentifiable card the user can dismiss", async () => {
      cardAbsent();
      const { hook, onLock } = await mountReadyScanner(autoMode);
      await act(async () => {
        await hook.result.current.start();
      });

      await landUnrecognisedCard();
      setDistances(bankState, { "k-a": 0.05 });
      currentInliers = () => 15;
      await pumpCameraFrame();

      expect(onLock).not.toHaveBeenCalled();
      expect(hook.result.current.unidentified).toHaveLength(1);
      const card = hook.result.current.unidentified[0]!;
      expect(card.candidates).toEqual([{ key: "k-a", artKey: "art-a" }]);

      await runFrames(1);
      expect(hook.result.current.readout.placements).toBe(1);
      expect(hook.result.current.readout.missedPlacements).toBe(1);

      act(() => {
        hook.result.current.dismissUnidentified(card.id);
      });
      expect(hook.result.current.unidentified).toEqual([]);
    });

    it("recovers a missed placement outright when the second look verifies it strongly", async () => {
      cardAbsent();
      const { hook, onLock } = await mountReadyScanner(autoMode);
      await act(async () => {
        await hook.result.current.start();
      });

      await landUnrecognisedCard();
      cardPresent();
      await pumpCameraFrame();

      expect(onLock).toHaveBeenCalledTimes(1);
      const lock = onLock.mock.calls[0]![0];
      expect(lock.key).toBe("k-a");
      expect(lock.framesToLock).toBe(1);
      expect(lock.inliers).toBe(40);
      expect(hook.result.current.unidentified).toEqual([]);

      await runFrames(1);
      expect(hook.result.current.readout.placements).toBe(1);
      expect(hook.result.current.readout.missedPlacements).toBe(0);
    });

    it("counts no placements at all in single mode", async () => {
      cardAbsent();
      const { hook } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      await landUnrecognisedCard();
      await runFrames(1);

      // Nothing lands on the ledger, so nothing reaches the second look and
      // the tray never reports a card the hand only appeared to put down.
      expect(hook.result.current.readout.placements).toBe(0);
      expect(hook.result.current.readout.missedPlacements).toBe(0);
      expect(hook.result.current.unidentified).toEqual([]);
    });
  });

  describe("single-mode re-lock guard", () => {
    it("reports the same card only once while it stays in the guide", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });

      await runFrames(12);
      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it("ignores a placement signal in single mode, where a hand fakes it", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });
      await runFrames(4);
      expect(onLock).toHaveBeenCalledTimes(1);

      await dealAnotherCopy();
      await runFrames(4);
      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it("counts a second copy dealt onto the pile in auto mode", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner({
        settings: { ...DEFAULT_SCANNER_SETTINGS, mode: "auto" },
      });
      await act(async () => {
        await hook.result.current.start();
      });
      await runFrames(4);
      expect(onLock).toHaveBeenCalledTimes(1);

      await dealAnotherCopy();
      await runFrames(4);
      expect(onLock).toHaveBeenCalledTimes(2);
    });
  });

  describe("identifyNow", () => {
    it("adds the card outright when the grabbed frame proves one", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });
      onLock.mockClear();

      let attempt!: IdentifyAttempt;
      await act(async () => {
        attempt = await hook.result.current.identifyNow();
      });

      expect(attempt.identified).toBe(true);
      expect(onLock).toHaveBeenCalledTimes(1);
      expect(onLock.mock.calls[0]![0].key).toBe("k-a");
    });

    it("offers the shortlist when the frame is not convincing on its own", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });
      onLock.mockClear();
      // Above the inlier floor, well short of standing alone.
      currentInliers = () => 15;

      let attempt!: IdentifyAttempt;
      await act(async () => {
        attempt = await hook.result.current.identifyNow();
      });

      expect(attempt.identified).toBe(false);
      expect(attempt.candidates).toEqual([{ key: "k-a", artKey: "art-a" }]);
      expect(onLock).not.toHaveBeenCalled();
    });

    it("hands the snapshot over before recognition starts", async () => {
      cardPresent();
      const { hook } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });
      const onSnapshot = vi.fn<(snapshot: string | null) => void>();

      await act(async () => {
        await hook.result.current.identifyNow(onSnapshot);
      });

      expect(onSnapshot).toHaveBeenCalledTimes(1);
    });

    it("does nothing while the camera is stopped", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();

      let attempt!: IdentifyAttempt;
      await act(async () => {
        attempt = await hook.result.current.identifyNow();
      });

      expect(attempt).toEqual({ snapshot: null, identified: false, candidates: [] });
      expect(onLock).not.toHaveBeenCalled();
    });

    it("stops the live pass adding the same card a second time", async () => {
      cardPresent();
      const { hook, onLock } = await mountReadyScanner();
      await act(async () => {
        await hook.result.current.start();
      });
      onLock.mockClear();

      await act(async () => {
        await hook.result.current.identifyNow();
      });
      expect(onLock).toHaveBeenCalledTimes(1);

      await runFrames(8);
      expect(onLock).toHaveBeenCalledTimes(1);
    });
  });
});
