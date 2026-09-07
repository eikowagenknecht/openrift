import { describe, expect, it } from "vitest";

import type { CardEmbedder, EmbedBank } from "./embed";
import {
  EMBED_DIM,
  EMBED_IMAGE_SIZE,
  embedImageSizeOf,
  normalizeEmbeddings,
  rankCardEmbedding,
  rankEmbedBank,
} from "./embed";
import { rotateRgbaCw } from "./image";
import type { RgbaImage } from "./types";

function axis(dimension: number): Float32Array {
  const vector = new Float32Array(EMBED_DIM);
  vector[dimension] = 1;
  return vector;
}

describe("rankEmbedBank", () => {
  const bank: EmbedBank = {
    keys: ["a", "b"],
    vectors: (() => {
      const vectors = new Float32Array(2 * EMBED_DIM);
      vectors.set(axis(0), 0);
      vectors.set(axis(1), EMBED_DIM);
      return vectors;
    })(),
  };

  it("ranks by best cosine over the query rotations", () => {
    const ranked = rankEmbedBank(bank, [axis(1), axis(2)], 2);
    expect(ranked[0]!.key).toBe("b");
    expect(ranked[0]!.distance).toBeCloseTo(0);
    expect(ranked[1]!.key).toBe("a");
  });

  it("reports which rotation matched", () => {
    const ranked = rankEmbedBank(bank, [axis(2), axis(0)], 1);
    expect(ranked[0]!.key).toBe("a");
    expect(ranked[0]!.rotation).toBe(1);
  });
});

describe("rankCardEmbedding", () => {
  const bank: EmbedBank = {
    keys: ["a", "b"],
    vectors: (() => {
      const vectors = new Float32Array(2 * EMBED_DIM);
      vectors.set(axis(0), 0);
      vectors.set(axis(1), EMBED_DIM);
      return vectors;
    })(),
  };
  const card: RgbaImage = {
    width: 8,
    height: 11,
    data: new Uint8ClampedArray(8 * 11 * 4),
  };

  function embedderOf(responses: Float32Array[][]): { embedder: CardEmbedder; calls: number[] } {
    const calls: number[] = [];
    const embedder: CardEmbedder = (_pixels, count) => {
      calls.push(count);
      const rows = responses[calls.length - 1] ?? [];
      const raw = new Float32Array(count * EMBED_DIM);
      for (const [slot, row] of rows.slice(0, count).entries()) {
        raw.set(row, slot * EMBED_DIM);
      }
      return Promise.resolve(raw);
    };
    return { embedder, calls };
  }

  it("stops after the upright rotation when it matches confidently", async () => {
    const { embedder, calls } = embedderOf([[axis(0)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.3,
    });
    expect(calls).toEqual([1]);
    expect(ranked[0]!.key).toBe("a");
    expect(ranked[0]!.distance).toBeCloseTo(0);
    expect(ranked[0]!.rotation).toBe(0);
  });

  it("runs the remaining rotations when upright is not confident", async () => {
    const { embedder, calls } = embedderOf([[axis(2)], [axis(3), axis(1), axis(4)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.3,
    });
    expect(calls).toEqual([1, 3]);
    expect(ranked[0]!.key).toBe("b");
    expect(ranked[0]!.distance).toBeCloseTo(0);
    expect(ranked[0]!.rotation).toBe(2);
  });

  it("skips the rotation fallback for a marginal but upright match", async () => {
    const marginal = new Float32Array(EMBED_DIM);
    marginal[0] = 0.72;
    marginal[2] = Math.sqrt(1 - 0.72 * 0.72);
    const { embedder, calls } = embedderOf([[marginal]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.2,
      rotationFallbackDistance: 0.35,
    });
    expect(calls).toEqual([1]);
    expect(ranked[0]!.key).toBe("a");
    expect(ranked[0]!.distance).toBeCloseTo(0.28);
  });

  it("stops after the unconfident upright pass when the rotation fallback is disallowed", async () => {
    const { embedder, calls } = embedderOf([[axis(2)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.3,
      allowRotationFallback: false,
    });
    expect(calls).toEqual([1]);
    expect(ranked[0]!.distance).toBeCloseTo(1);
  });

  it("labels a confident preferred-rotation match with that rotation", async () => {
    const { embedder, calls } = embedderOf([[axis(0)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.3,
      preferredRotation: 2,
    });
    expect(calls).toEqual([1]);
    expect(ranked[0]!.key).toBe("a");
    expect(ranked[0]!.rotation).toBe(2);
  });

  it("keeps rotation labels straight when falling back from a preferred rotation", async () => {
    const { embedder, calls } = embedderOf([[axis(2)], [axis(1), axis(3), axis(4)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.3,
      preferredRotation: 1,
    });
    expect(calls).toEqual([1, 3]);
    expect(ranked[0]!.key).toBe("b");
    expect(ranked[0]!.rotation).toBe(0);
  });

  it("falls back to only the 180-degree partner in pair-only mode", async () => {
    const { embedder, calls } = embedderOf([[axis(2)], [axis(1)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 2,
      confidentDistance: 0.3,
      preferredRotation: 1,
      pairOnly: true,
    });
    expect(calls).toEqual([1, 1]);
    expect(ranked[0]!.key).toBe("b");
    expect(ranked[0]!.rotation).toBe(3);
  });

  it("embeds all four rotations in one batch when the gate is disabled", async () => {
    const { embedder, calls } = embedderOf([[axis(0), axis(2), axis(3), axis(4)]]);
    const ranked = await rankCardEmbedding(card, "card", embedder, bank, {
      topK: 1,
      confidentDistance: -1,
    });
    expect(calls).toEqual([4]);
    expect(ranked[0]!.key).toBe("a");
    expect(ranked[0]!.rotation).toBe(0);
  });
});

describe("embedImageSizeOf", () => {
  it("reads the trailing spatial dimension of a declared shape", () => {
    expect(embedImageSizeOf(["batch", 3, 192, 192])).toBe(192);
    expect(embedImageSizeOf(["batch_size", 3, 256, 256])).toBe(256);
  });

  it("falls back to the MobileCLIP size for missing or symbolic dims", () => {
    expect(embedImageSizeOf(undefined)).toBe(EMBED_IMAGE_SIZE);
    expect(embedImageSizeOf([])).toBe(EMBED_IMAGE_SIZE);
    expect(embedImageSizeOf(["batch", 3, "height", "width"])).toBe(EMBED_IMAGE_SIZE);
    expect(embedImageSizeOf(["batch", 3, 192, 0])).toBe(EMBED_IMAGE_SIZE);
  });
});

describe("normalizeEmbeddings", () => {
  it("normalizes each row to unit length", () => {
    const raw = new Float32Array(EMBED_DIM * 2);
    raw[0] = 3;
    raw[EMBED_DIM] = 0.2;
    const rows = normalizeEmbeddings(raw, 2);
    expect(rows[0]![0]!).toBeCloseTo(1);
    expect(rows[1]![0]!).toBeCloseTo(1);
  });
});

describe("rotateRgbaCw", () => {
  it("returns to the original after four quarter turns", () => {
    const image: RgbaImage = {
      width: 2,
      height: 3,
      data: new Uint8ClampedArray(Array.from({ length: 24 }, (_, i) => i)),
    };
    let rotated = image;
    for (let turn = 0; turn < 4; turn++) {
      rotated = rotateRgbaCw(rotated);
    }
    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(3);
    expect([...rotated.data]).toEqual([...image.data]);
  });

  it("moves the top-left pixel to the top-right", () => {
    const image: RgbaImage = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([9, 9, 9, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    };
    const rotated = rotateRgbaCw(image);
    expect([...rotated.data.subarray(4, 8)]).toEqual([9, 9, 9, 9]);
  });
});
