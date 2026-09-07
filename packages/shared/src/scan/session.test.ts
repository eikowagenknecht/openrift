import { describe, expect, it } from "vitest";

import type { OpenCvLike } from "./detect-cv";
import type { CardEmbedder, EmbedBank } from "./embed";
import type { OrbCvLike } from "./orb";
import {
  DEFAULT_SESSION_OPTIONS,
  IDLE_AFTER_NO_WINNER_FRAMES,
  centeredGuideQuad,
  createScanSession,
  gatesForEmbedDim,
  idleBackoffActive,
  mergeCandidates,
  prioritizeTracked,
} from "./session";
import type { ScanSessionDeps, ScanSessionOptions } from "./session";
import { CARD_ASPECT } from "./types";
import type { CardCandidate, Quad, RgbaImage } from "./types";

function candidate(x: number, y: number, score: number): CardCandidate {
  const quad: Quad = [
    { x, y },
    { x: x + 100, y },
    { x: x + 100, y: y + 140 },
    { x, y: y + 140 },
  ];
  return { quad, aspect: 1.4, areaFraction: 0.2, rectangularity: 1, score };
}

describe("mergeCandidates", () => {
  it("keeps only the best-scoring of two overlapping proposals", () => {
    const weak = candidate(0, 0, 1);
    const strong = candidate(3, 3, 5);
    expect(mergeCandidates([weak, strong])).toEqual([strong]);
  });

  it("keeps proposals that do not overlap", () => {
    const a = candidate(0, 0, 5);
    const b = candidate(500, 500, 1);
    expect(mergeCandidates([a, b])).toEqual([a, b]);
  });

  it("returns candidates best first regardless of input order", () => {
    const low = candidate(0, 0, 1);
    const high = candidate(500, 500, 7);
    expect(mergeCandidates([low, high]).map((c) => c.score)).toEqual([7, 1]);
  });
});

describe("prioritizeTracked", () => {
  it("keeps the order when there is no anchor", () => {
    const a = candidate(0, 0, 5);
    const b = candidate(500, 500, 1);
    expect(prioritizeTracked([a, b], null)).toEqual([a, b]);
  });

  it("moves the candidate overlapping the anchor to the front", () => {
    const junk = candidate(500, 500, 9);
    const tracked = candidate(0, 0, 1);
    expect(prioritizeTracked([junk, tracked], candidate(4, 4, 0).quad)).toEqual(
      [junk, tracked].toReversed(),
    );
  });

  it("ignores overlaps below the tracking threshold", () => {
    const junk = candidate(500, 500, 9);
    const grazing = candidate(0, 0, 1);
    expect(prioritizeTracked([junk, grazing], candidate(80, 120, 0).quad)).toEqual([junk, grazing]);
  });

  it("preserves relative order among non-overlapping candidates", () => {
    const tracked = candidate(0, 0, 1);
    const far = candidate(500, 500, 9);
    const farther = candidate(900, 900, 3);
    expect(prioritizeTracked([far, farther, tracked], candidate(2, 2, 0).quad)).toEqual([
      tracked,
      far,
      farther,
    ]);
  });
});

describe("gatesForEmbedDim", () => {
  it("returns the custom-encoder calibration for 256-dimensional banks", () => {
    const gates = gatesForEmbedDim(256);
    expect(gates.confidentDistance).toBe(0.35);
    expect(gates.rotationFallbackDistance).toBe(0.42);
    expect(gates.slowRotationFallbackDistance).toBeLessThan(0.457);
    expect(gates.topK).toBe(2);
  });

  it("returns the MobileCLIP clip calibration for every other dimension", () => {
    for (const dim of [512, 0, 384]) {
      const gates = gatesForEmbedDim(dim);
      expect(gates.confidentDistance).toBe(DEFAULT_SESSION_OPTIONS.confidentDistance);
      expect(gates.rotationFallbackDistance).toBe(DEFAULT_SESSION_OPTIONS.rotationFallbackDistance);
      expect(gates.slowRotationFallbackDistance).toBe(0.45);
      expect(gates.topK).toBe(DEFAULT_SESSION_OPTIONS.topK);
    }
  });
});

describe("idleBackoffActive", () => {
  it("engages only after the streak threshold in guide sessions", () => {
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES - 1, true)).toBe(false);
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES, true)).toBe(true);
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES + 10, true)).toBe(true);
  });

  it("never engages for pan sessions", () => {
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES * 3, false)).toBe(false);
  });
});

describe("centeredGuideQuad", () => {
  it("centers a card-proportioned rect at 0.7 of the frame height", () => {
    const [topLeft, topRight, bottomRight] = centeredGuideQuad(1000, 800);
    const height = bottomRight.y - topRight.y;
    const width = topRight.x - topLeft.x;
    expect(height).toBeCloseTo(560);
    expect(width / height).toBeCloseTo(CARD_ASPECT);
    expect(topLeft.x).toBeCloseTo(1000 - topRight.x);
    expect(topLeft.y).toBeCloseTo(800 - bottomRight.y);
  });

  it("falls back to 0.9 of the width on a narrow portrait frame", () => {
    const [topLeft, topRight, bottomRight] = centeredGuideQuad(464, 848);
    const width = topRight.x - topLeft.x;
    expect(width).toBeCloseTo(0.9 * 464);
    expect(bottomRight.y - topRight.y).toBeCloseTo(width / CARD_ASPECT);
  });

  it("returns its corners clockwise from the top left", () => {
    const quad = centeredGuideQuad(1000, 800);
    expect(quad[0].x).toBeLessThan(quad[1].x);
    expect(quad[1].y).toBeLessThan(quad[2].y);
    expect(quad[3].x).toBeLessThan(quad[2].x);
    expect(quad[0].y).toBeLessThan(quad[3].y);
  });
});

const imageTags = new WeakMap<ArrayLike<number>, string>();

class Geometry {
  readonly args: number[];

  constructor(...args: number[]) {
    this.args = args;
  }
}

const STUB_MATCHES = 20;

function blankFrame(width = 384, height = 528): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(200);
  for (let index = 3; index < data.length; index += 4) {
    data[index] = 255;
  }
  return { data, width, height };
}

function taggedReference(tag: string): RgbaImage {
  const image = blankFrame(8, 11);
  imageTags.set(image.data, tag);
  return image;
}

function wholeFrameGuide(): (width: number, height: number) => Quad {
  return (width, height) => [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

interface StubCv {
  cv: OpenCvLike & OrbCvLike;
  releases: () => number;
}

function createStubCv(inliersFor: (tag: string | undefined) => number): StubCv {
  let releases = 0;
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

    delete(): void {
      releases++;
    }
  }

  class Orb {
    detectAndCompute(image: Mat, _mask: Mat, _keypoints: KeyPointVector, descriptors: Mat): void {
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

  return { cv: cv as unknown as OpenCvLike & OrbCvLike, releases: () => releases };
}

// Places each key at (cos, sin) of an angle so 1 - cos equals its requested distance
// from the fixed query vector (1, 0).
function createBank(distances: Record<string, number>): EmbedBank {
  const bank: EmbedBank = { keys: Object.keys(distances), vectors: new Float32Array(0) };
  bank.vectors = new Float32Array(bank.keys.length * 2);
  setDistances(bank, distances);
  return bank;
}

// Mutates in place: the session holds this bank object, not a copy, so a running
// session sees the change on its next frame.
function setDistances(bank: EmbedBank, distances: Record<string, number>): void {
  bank.keys.forEach((key, index) => {
    const cosine = 1 - (distances[key] ?? 2);
    bank.vectors[index * 2] = cosine;
    bank.vectors[index * 2 + 1] = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  });
}

function createEmbedder(): { embedder: CardEmbedder; calls: number[] } {
  const calls: number[] = [];
  const embedder: CardEmbedder = (_pixels, count) => {
    calls.push(count);
    const out = new Float32Array(count * 2);
    for (let slot = 0; slot < count; slot++) {
      out[slot * 2] = 1;
    }
    return Promise.resolve(out);
  };
  return { embedder, calls };
}

// Focus gates opened, so a featureless test frame still reaches the encoder.
function testOptions(overrides: Partial<ScanSessionOptions> = {}): Partial<ScanSessionOptions> {
  return {
    minFocus: 0,
    rotationMinFocus: 0,
    guideFor: wholeFrameGuide(),
    minInliers: 10,
    accept: { lockRun: 2, maxGapFrames: 6 },
    ...overrides,
  };
}

// Every optional catalogue lookup defaults to a single-printing artwork, which
// makes the disambiguation stage abstain.
function testDeps(overrides: Partial<ScanSessionDeps> & Pick<ScanSessionDeps, "cv">) {
  return {
    embedder: createEmbedder().embedder,
    bank: createBank({ "k-a": 0.1 }),
    artKeyOf: (key: string) => key,
    labelOf: (key: string) => key,
    fetchReference: () => Promise.resolve(taggedReference("ref")),
    ...overrides,
  } satisfies ScanSessionDeps;
}

// Timings are irrelevant here, and a real clock makes them flaky.
const frozenClock = () => 0;

describe("createScanSession — reference cache", () => {
  it("caches a definitively missing render, so one frame costs one request", async () => {
    let fetches = 0;
    const { cv } = createStubCv(() => 40);
    const session = createScanSession(
      testDeps({
        cv,
        fetchReference: () => {
          fetches++;
          return Promise.resolve(null);
        },
      }),
      testOptions(),
    );

    await session.processFrame(blankFrame(), 0, 0, frozenClock);
    await session.processFrame(blankFrame(), 1, 0.1, frozenClock);

    expect(fetches).toBe(1);
  });

  it("does not cache a transient failure, so a later frame retries it", async () => {
    let fetches = 0;
    const { cv } = createStubCv(() => 40);
    const session = createScanSession(
      testDeps({
        cv,
        fetchReference: () => {
          fetches++;
          return Promise.reject(new Error("connection dropped"));
        },
      }),
      testOptions(),
    );

    await session.processFrame(blankFrame(), 0, 0, frozenClock);
    await session.processFrame(blankFrame(), 1, 0.1, frozenClock);

    expect(fetches).toBe(2);
  });

  it("discards a frame whose shortlist had an unfetchable member", async () => {
    const { cv } = createStubCv(() => 40);
    const session = createScanSession(
      testDeps({
        cv,
        bank: createBank({ "k-a": 0.05, "k-b": 0.3 }),
        fetchReference: (key) =>
          key === "k-b"
            ? Promise.reject(new Error("connection dropped"))
            : Promise.resolve(taggedReference(key)),
      }),
      testOptions(),
    );

    const outcome = await session.processFrame(blankFrame(), 0, 0, frozenClock);

    expect(outcome.winner).toBeNull();
    expect(outcome.bestInliers).toBe(0);
    expect(outcome.candidate).not.toBeNull();
    expect(outcome.ranked.map((entry) => entry.key)).toEqual(["k-a", "k-b"]);
  });

  it("fetches a successfully cached render only once", async () => {
    let fetches = 0;
    const { cv } = createStubCv(() => 40);
    const session = createScanSession(
      testDeps({
        cv,
        fetchReference: (key) => {
          fetches++;
          return Promise.resolve(taggedReference(key));
        },
      }),
      testOptions(),
    );

    await session.processFrame(blankFrame(), 0, 0, frozenClock);
    await session.processFrame(blankFrame(), 1, 0.1, frozenClock);

    expect(fetches).toBe(1);
  });

  it("evicts the least recently used render past the cache limit and frees it", async () => {
    const keyCount = 300;
    const limit = 256;
    const distances: Record<string, number> = {};
    for (let index = 0; index < keyCount; index++) {
      distances[`k-${index}`] = 0.05 + index / 10_000;
    }
    const { cv, releases } = createStubCv(() => 0);
    const session = createScanSession(
      testDeps({
        cv,
        bank: createBank(distances),
        fetchReference: (key) => Promise.resolve(taggedReference(key)),
      }),
      testOptions({ topK: keyCount }),
    );

    await session.processFrame(blankFrame(), 0, 0, frozenClock);

    expect(releases()).toBe(keyCount - limit + 1);

    session.release();

    expect(releases()).toBe(keyCount + 1);
  });
});

describe("createScanSession — absent-frame re-arm", () => {
  // `present`/`absent` move the whole card in and out of frame at once: an absent
  // card must neither rank plausibly nor verify for a frame to count as absent.
  async function lockedSession() {
    const bank = createBank({ "k-a": 0.05 });
    let inliers = 40;
    const { cv } = createStubCv(() => inliers);
    const session = createScanSession(
      testDeps({ cv, bank, fetchReference: (key) => Promise.resolve(taggedReference(key)) }),
      testOptions(),
    );
    await session.processFrame(blankFrame(), 0, 0, frozenClock);
    await session.processFrame(blankFrame(), 1, 0.1, frozenClock);
    return {
      session,
      absent: () => {
        setDistances(bank, { "k-a": 0.9 });
        inliers = 0;
      },
      present: () => {
        setDistances(bank, { "k-a": 0.05 });
        inliers = 40;
      },
      unverifiable: () => {
        setDistances(bank, { "k-a": 0.3 });
        inliers = 0;
      },
    };
  }

  it("locks the artwork over the accept run", async () => {
    const { session } = await lockedSession();

    expect(session.state.get("k-a")?.lockedAt).not.toBeNull();
    expect(session.state.get("k-a")?.lockedThisRun).toBe(true);
  });

  it("needs two absent frames in a row, not one", async () => {
    // A single mid-hold detector dropout must not re-arm and double-count the card.
    const { session, absent } = await lockedSession();
    absent();

    await session.processFrame(blankFrame(), 2, 0.2, frozenClock);

    expect(session.state.get("k-a")?.lockedThisRun).toBe(true);
  });

  it("re-arms the locked track on the second absent frame", async () => {
    const { session, absent } = await lockedSession();
    absent();

    await session.processFrame(blankFrame(), 2, 0.2, frozenClock);
    await session.processFrame(blankFrame(), 3, 0.3, frozenClock);

    const track = session.state.get("k-a");
    expect(track?.lockedThisRun).toBe(false);
    expect(track?.runLength).toBe(0);
    expect(track?.lastFrame).toBe(Number.NEGATIVE_INFINITY);
    expect(track?.lockedAt).not.toBeNull();
  });

  it("treats a card that only verification missed as still present", async () => {
    const { session, absent, unverifiable } = await lockedSession();
    absent();

    await session.processFrame(blankFrame(), 2, 0.2, frozenClock);
    unverifiable();
    await session.processFrame(blankFrame(), 3, 0.3, frozenClock);
    absent();
    await session.processFrame(blankFrame(), 4, 0.4, frozenClock);

    expect(session.state.get("k-a")?.lockedThisRun).toBe(true);
  });

  it("lets the artwork lock again once the card comes back", async () => {
    const { session, absent, present } = await lockedSession();
    absent();
    await session.processFrame(blankFrame(), 2, 0.2, frozenClock);
    await session.processFrame(blankFrame(), 3, 0.3, frozenClock);

    present();
    await session.processFrame(blankFrame(), 4, 0.4, frozenClock);
    const second = await session.processFrame(blankFrame(), 5, 0.5, frozenClock);

    expect(second.locked?.artKey).toBe("k-a");
  });

  it("re-arms on demand and clears the absent streak with it", async () => {
    const { session, absent } = await lockedSession();
    absent();

    await session.processFrame(blankFrame(), 2, 0.2, frozenClock);
    session.rearm();
    await session.processFrame(blankFrame(), 3, 0.3, frozenClock);

    const track = session.state.get("k-a");
    expect(track?.lockedThisRun).toBe(false);
    expect(track?.runLength).toBe(0);
  });
});

describe("createScanSession — idle backoff", () => {
  function idleSession() {
    const bank = createBank({ "k-a": 0.9 });
    const { embedder, calls } = createEmbedder();
    const { cv } = createStubCv(() => 0);
    const session = createScanSession(
      testDeps({
        cv,
        bank,
        embedder,
        fetchReference: (key) => Promise.resolve(taggedReference(key)),
      }),
      testOptions(),
    );
    return { session, bank, calls };
  }

  it("pays the full rotation search while the streak is short", async () => {
    const { session, calls } = idleSession();

    await session.processFrame(blankFrame(), 0, 0, frozenClock);

    // [1, 3]: upright first, then the three other quarter turns.
    expect(calls).toEqual([1, 3]);
  });

  it("embeds upright only once the winner-less streak crosses the threshold", async () => {
    const { session, calls } = idleSession();
    for (let frame = 0; frame < IDLE_AFTER_NO_WINNER_FRAMES; frame++) {
      await session.processFrame(blankFrame(), frame, frame / 10, frozenClock);
    }
    calls.length = 0;

    await session.processFrame(blankFrame(), IDLE_AFTER_NO_WINNER_FRAMES, 0.5, frozenClock);

    expect(calls).toEqual([1]);
  });

  it("restores the full search on the frame after one that ranked plausibly", async () => {
    const { session, bank, calls } = idleSession();
    for (let frame = 0; frame < IDLE_AFTER_NO_WINNER_FRAMES; frame++) {
      await session.processFrame(blankFrame(), frame, frame / 10, frozenClock);
    }

    setDistances(bank, { "k-a": 0.3 });
    await session.processFrame(blankFrame(), 5, 0.5, frozenClock);
    setDistances(bank, { "k-a": 0.9 });
    calls.length = 0;
    await session.processFrame(blankFrame(), 6, 0.6, frozenClock);

    expect(calls).toEqual([1, 3]);
  });
});

// A card whose lower band carries a per-printing block over a shared base; stamp 0
// leaves the base untouched, giving two byte-identical printings.
function printingCard(tag: string, stamp: number): RgbaImage {
  const width = 384;
  const height = 528;
  const data = new Uint8ClampedArray(width * height * 4);
  // Inside TEXT_REGION, the fallback name band for an unknown card type.
  const top = height * 0.65;
  const bottom = height * 0.81;
  const left = width * 0.28;
  const right = width * 0.72;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Must stay smooth, low-frequency, with no straight edges, or the rectangle
      // detector proposes this block, not the guide.
      let value = 128 + 60 * Math.sin((2 * Math.PI * x) / 220) * Math.cos((2 * Math.PI * y) / 300);
      if (stamp > 0 && y >= top && y < bottom && x >= left && x < right) {
        // Windowed by half-sines: the glyph term must fade to zero at the band boundary.
        const acrossX = Math.sin((Math.PI * (x - left)) / (right - left));
        const acrossY = Math.sin((Math.PI * (y - top)) / (bottom - top));
        value +=
          90 * acrossX * acrossY * Math.sin((2 * Math.PI * stamp * (x - left)) / (right - left));
      }
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const image = { data, width, height };
  imageTags.set(data, tag);
  return image;
}

describe("createScanSession — printing disambiguation", () => {
  const ART = "art-lux";

  function printingSession(
    renders: Record<string, number>,
    labels: Record<string, string> = {},
    aimedAt?: string,
  ) {
    const keys = Object.keys(renders);
    const images = new Map(keys.map((key) => [key, printingCard(key, renders[key]!)]));
    const bank = createBank(
      Object.fromEntries(keys.map((key, index) => [key, 0.05 + index / 100])),
    );
    const { cv } = createStubCv(() => 40);
    const session = createScanSession(
      testDeps({
        cv,
        bank,
        artKeyOf: () => ART,
        labelOf: (key) => labels[key] ?? key,
        fetchReference: (key) => Promise.resolve(images.get(key) ?? null),
      }),
      testOptions({ topK: keys.length }),
    );
    return { session, frame: printingCard("query", renders[aimedAt ?? keys[0]!]!) };
  }

  it("abstains for an artwork with a single printing", async () => {
    const { session, frame } = printingSession({ "p-en": 1 });

    await session.processFrame(frame, 0, 0, frozenClock);
    const lock = await session.processFrame(frame, 1, 0.1, frozenClock);

    expect(lock.locked?.artKey).toBe(ART);
    expect(lock.printingScores).toBeUndefined();
  });

  it("holds the pick back until a second frame agrees with it", async () => {
    const { session, frame } = printingSession({ "p-en": 1, "p-sc": 9 });

    await session.processFrame(frame, 0, 0, frozenClock);
    const lock = await session.processFrame(frame, 1, 0.1, frozenClock);

    expect(lock.locked?.artKey).toBe(ART);
    expect(lock.printingScores?.map((score) => score.key)).toEqual(["p-en", "p-sc"]);
    expect(lock.printingTrack?.resolved).toBe(false);
    expect(session.state.get(ART)?.printingResolved).toBe(false);
  });

  it("applies the pick on the second agreeing frame", async () => {
    const { session, frame } = printingSession({ "p-en": 1, "p-sc": 9 });

    await session.processFrame(frame, 0, 0, frozenClock);
    await session.processFrame(frame, 1, 0.1, frozenClock);
    const retry = await session.processFrame(frame, 2, 0.2, frozenClock);

    expect(retry.printingVia).toBe("name");
    expect(retry.printingTrack?.key).toBe("p-en");
    expect(retry.printingTrack?.resolved).toBe(true);
    const track = session.state.get(ART);
    expect(track?.key).toBe("p-en");
    expect(track?.printingResolved).toBe(true);
  });

  it("follows the card in front of the camera, not the shortlist order", async () => {
    const { session, frame } = printingSession({ "p-en": 1, "p-sc": 9 }, {}, "p-sc");

    await session.processFrame(frame, 0, 0, frozenClock);
    await session.processFrame(frame, 1, 0.1, frozenClock);
    const retry = await session.processFrame(frame, 2, 0.2, frozenClock);

    expect(retry.printingTrack?.key).toBe("p-sc");
    expect(retry.printingTrack?.resolved).toBe(true);
  });

  it("stops retrying once the track is resolved", async () => {
    const { session, frame } = printingSession({ "p-en": 1, "p-sc": 9 });

    await session.processFrame(frame, 0, 0, frozenClock);
    await session.processFrame(frame, 1, 0.1, frozenClock);
    await session.processFrame(frame, 2, 0.2, frozenClock);
    const after = await session.processFrame(frame, 3, 0.3, frozenClock);

    expect(after.printingTrack).toBeUndefined();
    expect(after.printingScores).toBeUndefined();
  });

  it("refuses to name a residual class whose members disagree on their label", async () => {
    const { session, frame } = printingSession(
      { "p-en": 1, "p-dup": 1, "p-sc": 9 },
      { "p-en": "Lux [OGN EN]", "p-dup": "Lux [UNL EN]", "p-sc": "Lux [OGN SC]" },
    );

    await session.processFrame(frame, 0, 0, frozenClock);
    await session.processFrame(frame, 1, 0.1, frozenClock);
    const retry = await session.processFrame(frame, 2, 0.2, frozenClock);

    expect(retry.printingTrack?.resolved).toBe(false);
    expect(session.state.get(ART)?.printingResolved).toBe(false);
  });

  it("names a residual class whose members are the same printing twice", async () => {
    const { session, frame } = printingSession(
      { "p-en": 1, "p-dup": 1, "p-sc": 9 },
      { "p-en": "Lux [OGN EN]", "p-dup": "Lux [OGN EN]", "p-sc": "Lux [OGN SC]" },
    );

    await session.processFrame(frame, 0, 0, frozenClock);
    await session.processFrame(frame, 1, 0.1, frozenClock);
    const retry = await session.processFrame(frame, 2, 0.2, frozenClock);

    expect(retry.printingTrack?.resolved).toBe(true);
    expect(session.state.get(ART)?.label).toBe("Lux [OGN EN]");
  });
});
