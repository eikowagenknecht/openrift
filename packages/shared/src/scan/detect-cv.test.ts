import { describe, expect, it } from "vitest";

import { detectCardsWithCv } from "./detect-cv";
import type { OpenCvLike } from "./detect-cv";
import type { GrayImage } from "./types";

interface FakeRect {
  center: { x: number; y: number };
  size: { width: number; height: number };
  angle: number;
}

interface FakeContour {
  area: number;
  rect: FakeRect;
}

const RECIPE_COUNT = 3;

function contour(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  fill: number,
): FakeContour {
  return {
    area: width * height * fill,
    rect: { center: { x: centerX, y: centerY }, size: { width, height }, angle: 0 },
  };
}

function frame(width: number, height: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(120), width, height };
}

function makeCv(contours: FakeContour[]): { cv: OpenCvLike; live: () => number } {
  const specs = new WeakMap<object, FakeContour>();
  const vectors = new WeakMap<object, FakeMat[]>();
  let live = 0;

  class FakeMat {
    rows = 0;
    cols = 0;
    data = new Uint8Array(0);
    data32S = new Int32Array(0);

    constructor(rows?: number, cols?: number) {
      this.rows = rows ?? 0;
      this.cols = cols ?? 0;
      this.data = new Uint8Array((rows ?? 0) * (cols ?? 0));
      live++;
    }

    delete(): void {
      live--;
    }
  }

  class FakeMatVector {
    constructor() {
      live++;
      vectors.set(this, []);
    }

    size(): number {
      return vectors.get(this)?.length ?? 0;
    }

    get(index: number): FakeMat {
      const mat = vectors.get(this)?.[index];
      if (!mat) {
        throw new Error(`no contour at ${index}`);
      }
      return mat;
    }

    delete(): void {
      live--;
    }
  }

  class FakeSize {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  }

  const cv: OpenCvLike = {
    Mat: FakeMat,
    MatVector: FakeMatVector,
    Size: FakeSize,
    RotatedRect: {
      points: (rect: FakeRect) => {
        const halfWidth = rect.size.width / 2;
        const halfHeight = rect.size.height / 2;
        return [
          { x: rect.center.x - halfWidth, y: rect.center.y + halfHeight },
          { x: rect.center.x - halfWidth, y: rect.center.y - halfHeight },
          { x: rect.center.x + halfWidth, y: rect.center.y - halfHeight },
          { x: rect.center.x + halfWidth, y: rect.center.y + halfHeight },
        ];
      },
    },
    CV_8UC1: 0,
    COLOR_RGBA2GRAY: 1,
    MORPH_RECT: 2,
    MORPH_CLOSE: 3,
    ADAPTIVE_THRESH_GAUSSIAN_C: 4,
    THRESH_BINARY: 5,
    THRESH_BINARY_INV: 6,
    THRESH_OTSU: 7,
    RETR_LIST: 8,
    CHAIN_APPROX_SIMPLE: 9,
    cvtColor: () => undefined,
    resize: () => undefined,
    medianBlur: () => undefined,
    GaussianBlur: () => undefined,
    adaptiveThreshold: () => undefined,
    threshold: () => undefined,
    getStructuringElement: () => new FakeMat(),
    morphologyEx: () => undefined,
    findContours: (_image, target: object) => {
      const mats = contours.map((spec) => {
        const mat = new FakeMat();
        specs.set(mat, spec);
        return mat;
      });
      vectors.set(target, mats);
    },
    contourArea: (mat: object) => specs.get(mat)?.area ?? 0,
    minAreaRect: (mat: object) => {
      const spec = specs.get(mat);
      if (!spec) {
        throw new Error("minAreaRect on an unknown contour");
      }
      return spec.rect;
    },
  };

  return { cv, live: () => live };
}

const OPTIONS = { workingSize: 160 } as const;

describe("detectCardsWithCv", () => {
  it("returns nothing when the frame has no contours", () => {
    const { cv } = makeCv([]);
    expect(detectCardsWithCv(cv, frame(320, 400), OPTIONS)).toEqual([]);
  });

  it("maps the accepted quad back into full-frame coordinates", () => {
    const { cv } = makeCv([contour(64, 80, 50, 70, 0.9)]);
    const found = detectCardsWithCv(cv, frame(320, 400), OPTIONS);

    expect(found).toHaveLength(RECIPE_COUNT);
    expect(found[0]!.quad).toEqual([
      { x: 97.5, y: 112.5 },
      { x: 222.5, y: 112.5 },
      { x: 222.5, y: 287.5 },
      { x: 97.5, y: 287.5 },
    ]);
  });

  it("reports the contour's aspect, fill and area share", () => {
    const { cv } = makeCv([contour(64, 80, 50, 70, 0.9)]);
    const [first] = detectCardsWithCv(cv, frame(320, 400), OPTIONS);

    expect(first!.aspect).toBeCloseTo(1.4, 10);
    expect(first!.rectangularity).toBeCloseTo(0.9, 10);
    expect(first!.areaFraction).toBeCloseTo(3500 / (128 * 160), 10);
    expect(first!.score).toBeGreaterThan(0);
    expect(first!.score).toBeLessThanOrEqual(1);
  });

  it("drops a contour covering less of the frame than the minimum", () => {
    const { cv } = makeCv([contour(64, 80, 50, 70, 0.001)]);
    expect(detectCardsWithCv(cv, frame(320, 400), OPTIONS)).toEqual([]);
  });

  it("drops a contour that is too square to be a card", () => {
    const { cv } = makeCv([contour(64, 80, 60, 60, 0.9)]);
    expect(detectCardsWithCv(cv, frame(320, 400), OPTIONS)).toEqual([]);
  });

  it("drops a contour that is too elongated to be a card", () => {
    const { cv } = makeCv([contour(64, 80, 30, 90, 0.9)]);
    expect(detectCardsWithCv(cv, frame(320, 400), OPTIONS)).toEqual([]);
  });

  it("drops a contour that fills too little of its own bounding rect", () => {
    const { cv } = makeCv([contour(64, 80, 50, 70, 0.5)]);
    expect(detectCardsWithCv(cv, frame(320, 400), OPTIONS)).toEqual([]);
  });

  it("drops a rect with no area", () => {
    const { cv } = makeCv([contour(64, 80, 0, 70, 1)]);
    expect(detectCardsWithCv(cv, frame(320, 400), OPTIONS)).toEqual([]);
  });

  it("scores a centred card above an off-centre one and returns them sorted", () => {
    const { cv } = makeCv([contour(20, 25, 50, 70, 0.9), contour(64, 80, 50, 70, 0.9)]);
    const found = detectCardsWithCv(cv, frame(320, 400), OPTIONS);

    expect(found.map((candidate) => candidate.score)).toEqual(
      found.map((candidate) => candidate.score).toSorted((a, b) => b - a),
    );
    expect(found[0]!.quad[0]).toEqual({ x: 97.5, y: 112.5 });
  });

  it("caps the result at maxCandidates", () => {
    const { cv } = makeCv([contour(20, 25, 50, 70, 0.9), contour(64, 80, 50, 70, 0.9)]);
    expect(detectCardsWithCv(cv, frame(320, 400), { ...OPTIONS, maxCandidates: 2 })).toHaveLength(
      2,
    );
  });

  it("frees every matrix it allocates", () => {
    const { cv, live } = makeCv([contour(64, 80, 50, 70, 0.9), contour(20, 25, 60, 60, 0.9)]);
    detectCardsWithCv(cv, frame(320, 400), OPTIONS);
    expect(live()).toBe(0);
  });
});
