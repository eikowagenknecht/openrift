import { describe, expect, it } from "vitest";

import { artWindowRect } from "./art-window";
import { describeOrb, releaseOrb, verifyOrb } from "./orb";
import type { OrbCvLike, OrbFeatures } from "./orb";
import type { RgbaImage } from "./types";

interface FakeMatch {
  distance: number;
  queryIdx: number;
  trainIdx: number;
}

interface Recorder {
  cv: OrbCvLike;
  live: () => number;
  maskRects: unknown[];
  maskFills: unknown[];
  homographyCalls: number;
  maxFeaturesSeen: number[];
}

interface FakeCvOptions {
  knn?: FakeMatch[][];
  inlierMask?: number[];
  homographyEmpty?: boolean;
}

function makeCv(options: FakeCvOptions = {}): Recorder {
  const recorder: Recorder = {
    cv: undefined as unknown as OrbCvLike,
    live: () => live,
    maskRects: [],
    maskFills: [],
    homographyCalls: 0,
    maxFeaturesSeen: [],
  };
  let live = 0;

  class FakeMat {
    rows = 0;
    data: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

    constructor(rows?: number, cols?: number) {
      this.rows = rows ?? 0;
      this.data = new Uint8Array((rows ?? 0) * (cols ?? 0) * 4);
      live++;
    }

    static zeros(rows: number, cols: number): FakeMat {
      return new FakeMat(rows, cols);
    }

    roi(rect: unknown): FakeMat {
      recorder.maskRects.push(rect);
      return new FakeMat();
    }

    setTo(value: unknown): void {
      recorder.maskFills.push(value);
    }

    empty(): boolean {
      return options.homographyEmpty === true;
    }

    delete(): void {
      live--;
    }
  }

  class FakeKeyPointVector {
    constructor() {
      live++;
    }

    get(index: number): { pt: { x: number; y: number } } {
      return { pt: { x: index, y: index * 2 } };
    }

    delete(): void {
      live--;
    }
  }

  class FakeOrb {
    constructor(maxFeatures: number) {
      live++;
      recorder.maxFeaturesSeen.push(maxFeatures);
    }

    detectAndCompute(): void {
      return undefined;
    }

    delete(): void {
      live--;
    }
  }

  class FakeMatcher {
    constructor() {
      live++;
    }

    knnMatch(): void {
      return undefined;
    }

    delete(): void {
      live--;
    }
  }

  class FakePair {
    private readonly matches: FakeMatch[];

    constructor(matches: FakeMatch[]) {
      this.matches = matches;
      live++;
    }

    size(): number {
      return this.matches.length;
    }

    get(index: number): FakeMatch {
      const match = this.matches[index];
      if (!match) {
        throw new Error(`no match at ${index}`);
      }
      return match;
    }

    delete(): void {
      live--;
    }
  }

  class FakeKnn {
    private readonly pairs = (options.knn ?? []).map((matches) => new FakePair(matches));

    constructor() {
      live++;
    }

    size(): number {
      return this.pairs.length;
    }

    get(index: number): FakePair {
      const pair = this.pairs[index];
      if (!pair) {
        throw new Error(`no pair at ${index}`);
      }
      return pair;
    }

    delete(): void {
      live--;
    }
  }

  recorder.cv = {
    Mat: FakeMat,
    ORB: FakeOrb,
    KeyPointVector: FakeKeyPointVector,
    BFMatcher: FakeMatcher,
    DMatchVectorVector: FakeKnn,
    Rect: class {
      x: number;
      y: number;
      width: number;
      height: number;

      constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
      }
    },
    Scalar: class {
      value: number;

      constructor(value: number) {
        this.value = value;
      }
    },
    matFromArray: (rows: number) => new FakeMat(rows, 1),
    findHomography: (
      _source,
      _destination,
      _method,
      _threshold,
      mask: { rows: number; data: Uint8Array<ArrayBufferLike> },
    ) => {
      recorder.homographyCalls++;
      const values = options.inlierMask ?? [];
      mask.rows = values.length;
      mask.data = new Uint8Array(values);
      return new FakeMat();
    },
    cvtColor: () => undefined,
    equalizeHist: () => undefined,
    CV_8UC4: 0,
    CV_8UC1: 1,
    CV_32FC2: 2,
    COLOR_RGBA2GRAY: 3,
    NORM_HAMMING: 4,
    RANSAC: 5,
  };

  return recorder;
}

function image(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

function features(cv: OrbCvLike, rows: number): OrbFeatures {
  const descriptors = new cv.Mat(rows, 32);
  descriptors.rows = rows;
  return { keypoints: new cv.KeyPointVector(), descriptors };
}

describe("describeOrb", () => {
  it("passes the requested feature budget to the detector", () => {
    const recorder = makeCv();
    releaseOrb(describeOrb(recorder.cv, image(20, 30), 250));
    expect(recorder.maxFeaturesSeen).toEqual([250]);
  });

  it("leaves the mask unrestricted when artOnly is off", () => {
    const recorder = makeCv();
    releaseOrb(describeOrb(recorder.cv, image(20, 30)));
    expect(recorder.maskRects).toEqual([]);
    expect(recorder.maskFills).toEqual([]);
  });

  it("restricts the mask to the art window when artOnly is on", () => {
    const recorder = makeCv();
    releaseOrb(describeOrb(recorder.cv, image(200, 280), 700, true));
    expect(recorder.maskRects).toEqual([artWindowRect(200, 280)]);
    expect(recorder.maskFills).toEqual([{ value: 255 }]);
  });

  it("frees its working matrices and keeps only the returned pair alive", () => {
    const recorder = makeCv();
    const result = describeOrb(recorder.cv, image(20, 30), 700, true);
    expect(recorder.live()).toBe(2);
    releaseOrb(result);
    expect(recorder.live()).toBe(0);
  });
});

describe("verifyOrb", () => {
  it("gives up when the query has fewer than eight descriptors", () => {
    const recorder = makeCv();
    const verdict = verifyOrb(recorder.cv, features(recorder.cv, 7), features(recorder.cv, 40));
    expect(verdict).toEqual({ matched: 0, inliers: 0, ratio: 0 });
    expect(recorder.homographyCalls).toBe(0);
  });

  it("gives up when the reference has fewer than eight descriptors", () => {
    const recorder = makeCv();
    const verdict = verifyOrb(recorder.cv, features(recorder.cv, 40), features(recorder.cv, 7));
    expect(verdict).toEqual({ matched: 0, inliers: 0, ratio: 0 });
    expect(recorder.homographyCalls).toBe(0);
  });

  it("discards correspondences that fail Lowe's ratio test", () => {
    const knn = Array.from({ length: 10 }, (_unused, index) => [
      { distance: 80, queryIdx: index, trainIdx: index },
      { distance: 100, queryIdx: index, trainIdx: index },
    ]);
    const recorder = makeCv({ knn });
    const verdict = verifyOrb(recorder.cv, features(recorder.cv, 40), features(recorder.cv, 40));
    expect(verdict).toEqual({ matched: 0, inliers: 0, ratio: 0 });
    expect(recorder.homographyCalls).toBe(0);
  });

  it("skips knn entries that returned only one neighbour", () => {
    const knn = Array.from({ length: 10 }, (_unused, index) => [
      { distance: 10, queryIdx: index, trainIdx: index },
    ]);
    const recorder = makeCv({ knn });
    expect(verifyOrb(recorder.cv, features(recorder.cv, 40), features(recorder.cv, 40))).toEqual({
      matched: 0,
      inliers: 0,
      ratio: 0,
    });
  });

  it("reports the survivors but skips the homography below eight matches", () => {
    const knn = Array.from({ length: 7 }, (_unused, index) => [
      { distance: 10, queryIdx: index, trainIdx: index },
      { distance: 100, queryIdx: index, trainIdx: index },
    ]);
    const recorder = makeCv({ knn });
    expect(verifyOrb(recorder.cv, features(recorder.cv, 40), features(recorder.cv, 40))).toEqual({
      matched: 7,
      inliers: 0,
      ratio: 0,
    });
    expect(recorder.homographyCalls).toBe(0);
  });

  it("counts the non-zero mask entries as inliers and reports their share", () => {
    const knn = Array.from({ length: 10 }, (_unused, index) => [
      { distance: 10, queryIdx: index, trainIdx: index },
      { distance: 100, queryIdx: index, trainIdx: index },
    ]);
    const recorder = makeCv({ knn, inlierMask: [1, 1, 0, 1, 1, 1, 0, 1, 1, 0] });
    expect(verifyOrb(recorder.cv, features(recorder.cv, 40), features(recorder.cv, 40))).toEqual({
      matched: 10,
      inliers: 7,
      ratio: 0.7,
    });
    expect(recorder.homographyCalls).toBe(1);
  });

  it("reports no inliers when the homography could not be estimated", () => {
    const knn = Array.from({ length: 10 }, (_unused, index) => [
      { distance: 10, queryIdx: index, trainIdx: index },
      { distance: 100, queryIdx: index, trainIdx: index },
    ]);
    const recorder = makeCv({
      knn,
      inlierMask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      homographyEmpty: true,
    });
    expect(verifyOrb(recorder.cv, features(recorder.cv, 40), features(recorder.cv, 40))).toEqual({
      matched: 10,
      inliers: 0,
      ratio: 0,
    });
  });

  it("keeps only the two feature handles alive after a full verification", () => {
    const knn = Array.from({ length: 10 }, (_unused, index) => [
      { distance: 10, queryIdx: index, trainIdx: index },
      { distance: 100, queryIdx: index, trainIdx: index },
    ]);
    const recorder = makeCv({ knn, inlierMask: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0] });
    const query = features(recorder.cv, 40);
    const reference = features(recorder.cv, 40);
    verifyOrb(recorder.cv, query, reference);
    releaseOrb(query);
    releaseOrb(reference);
    expect(recorder.live()).toBe(0);
  });
});
