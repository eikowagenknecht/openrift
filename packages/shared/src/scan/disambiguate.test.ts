import { describe, expect, it } from "vitest";

import type { PrintingSignature } from "./disambiguate";
import {
  CODE_SIGNATURE_WIDTH,
  SIGNATURE_WIDTH,
  bestShiftCorrelation,
  codeStripSignature,
  correlateSignatures,
  discriminativeMargin,
  printingSignature,
  resolvePrinting,
  runPrintingTournament,
  textRegionSignature,
} from "./disambiguate";
import type { GrayImage, RgbaImage } from "./types";

/**
 * Build a portrait card image whose text band carries a per-seed pattern.
 *
 * The art half is identical across seeds (like shared artwork); the lower
 * band's pixels vary by seed (like language glyphs).
 *
 * @returns The card image.
 */
function cardWithTextPattern(seed: number, noise = 0): RgbaImage {
  const width = 63;
  const height = 88;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inTextBand = y > height * 0.5;
      const base = inTextBand ? ((x * (seed + 3) + y * seed) % 41) * 6 : (x + y) % 200;
      const value = Math.max(0, Math.min(255, base + ((x + y) % 7 <= noise ? 90 : 0)));
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * Build a full-resolution portrait card (the rectified query size), with a
 * textured code strip so the strip survives rastering.
 *
 * @returns The card image.
 */
function fullSizeCard(seed: number): RgbaImage {
  const width = 384;
  const height = 528;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = ((x * (seed + 3) + y * 13 + ((x * y) % 5)) % 97) * 2;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * Build a signature-sized gray band: a shared base texture with a centred
 * stamp block whose pixels depend on `stamp` — like glyphs that differ
 * between two printings while the frame around them is identical. Stamp 0
 * leaves the base untouched.
 *
 * @returns The gray band.
 */
function bandWithStamp(width: number, height: number, stamp: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inStamp =
        stamp > 0 &&
        y >= height / 3 &&
        y < (2 * height) / 3 &&
        x >= width / 4 &&
        x < (3 * width) / 4;
      data[y * width + x] = inStamp
        ? ((x * (stamp + 2) + y * stamp) % 53) * 4
        : ((x * 7 + y * 13 + ((x * y) % 5)) % 97) * 2;
    }
  }
  return { data, width, height };
}

/**
 * Shift a signature diagonally, clamping at the border.
 *
 * @returns The shifted copy.
 */
function shifted(signature: GrayImage, offset: number): GrayImage {
  const { width, height } = signature;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(height - 1, Math.max(0, y + offset));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1, Math.max(0, x + offset));
      data[y * width + x] = signature.data[sy * width + sx];
    }
  }
  return { data, width, height };
}

describe("textRegionSignature", () => {
  it("produces a fixed-size signature for portrait images", () => {
    const signature = textRegionSignature(cardWithTextPattern(1));
    expect(signature?.width).toBe(SIGNATURE_WIDTH);
    expect(signature?.height).toBeGreaterThanOrEqual(24);
    expect(signature?.height).toBeLessThanOrEqual(96);
  });

  it("abstains on landscape images", () => {
    const landscape: RgbaImage = {
      data: new Uint8ClampedArray(88 * 63 * 4),
      width: 88,
      height: 63,
    };
    expect(textRegionSignature(landscape)).toBeNull();
  });
});

describe("codeStripSignature", () => {
  it("produces a signature at full query resolution", () => {
    const signature = codeStripSignature(fullSizeCard(1));
    expect(signature?.width).toBe(CODE_SIGNATURE_WIDTH);
    expect(signature?.height).toBeGreaterThanOrEqual(12);
    expect(signature?.height).toBeLessThanOrEqual(32);
  });

  it("abstains when the strip would need upscaling", () => {
    expect(codeStripSignature(cardWithTextPattern(1))).toBeNull();
  });

  it("abstains on landscape images", () => {
    const landscape: RgbaImage = {
      data: new Uint8ClampedArray(528 * 384 * 4),
      width: 528,
      height: 384,
    };
    expect(codeStripSignature(landscape)).toBeNull();
  });
});

describe("printingSignature", () => {
  it("carries both bands at full resolution and only the name band below it", () => {
    const full = printingSignature(fullSizeCard(1));
    expect(full?.name).toBeTruthy();
    expect(full?.code).toBeTruthy();
    const small = printingSignature(cardWithTextPattern(1));
    expect(small?.name).toBeTruthy();
    expect(small?.code).toBeNull();
  });
});

describe("correlateSignatures", () => {
  it("scores an identical signature at 1", () => {
    const signature = textRegionSignature(cardWithTextPattern(1));
    if (!signature) {
      throw new Error("expected a signature");
    }
    expect(correlateSignatures(signature, signature)).toBeCloseTo(1);
  });

  it("returns 0 for a flat signature", () => {
    const flat: GrayImage = { data: new Uint8Array(16), width: 4, height: 4 };
    const other: GrayImage = {
      data: Uint8Array.from({ length: 16 }, (_, i) => i * 16),
      width: 4,
      height: 4,
    };
    expect(correlateSignatures(flat, other)).toBe(0);
  });
});

describe("discriminative tournament", () => {
  // Stamp-block bands rather than rastered synthetic cards: real glyph
  // differences are character-sized blocks, and the mask erosion (which
  // removes thin provenance halos) legitimately removes per-pixel noise
  // patterns too.
  const en = bandWithStamp(SIGNATURE_WIDTH, 36, 1);
  const sc = bandWithStamp(SIGNATURE_WIDTH, 36, 9);
  const misalignedEn = shifted(en, 2);

  it("recovers a misaligned self-match through the shift search", () => {
    expect(correlateSignatures(misalignedEn, en)).toBeLessThan(0.99);
    expect(bestShiftCorrelation(misalignedEn, en).score).toBeGreaterThan(0.98);
  });

  it("gives the true printing a positive margin despite misalignment", () => {
    expect(discriminativeMargin(misalignedEn, en, sc)).toBeGreaterThan(0.2);
    expect(discriminativeMargin(misalignedEn, sc, en)).toBeLessThan(-0.2);
  });

  it("returns null for identical references", () => {
    expect(discriminativeMargin(misalignedEn, en, en)).toBeNull();
  });

  it("is not blocked by a duplicate render of the winner", () => {
    const duplicate = { data: Uint8Array.from(en.data), width: en.width, height: en.height };
    const outcome = runPrintingTournament(
      misalignedEn,
      new Map([
        ["en", en],
        ["en-duplicate", duplicate],
        ["sc", sc],
      ]),
      0.55,
      0.15,
    );
    expect(outcome.pick?.key === "en" || outcome.pick?.key === "en-duplicate").toBe(true);
    expect(outcome.pick?.margin).toBeGreaterThan(0.08);
  });

  it("picks the true printing in the tournament", () => {
    const outcome = runPrintingTournament(
      misalignedEn,
      new Map([
        ["en", en],
        ["sc", sc],
        ["missing", null],
      ]),
      0.55,
      0.15,
    );
    expect(outcome.pick?.key).toBe("en");
    expect(outcome.pick?.margin).toBeGreaterThan(0.08);
    expect(outcome.evaluatedPairs).toBeGreaterThan(0);
  });

  it("reports structural blindness when the candidates are indistinguishable", () => {
    const outcome = runPrintingTournament(
      misalignedEn,
      new Map([
        ["a", en],
        ["b", en],
      ]),
      0.55,
      0.15,
    );
    expect(outcome.pick).toBeNull();
    expect(outcome.evaluatedPairs).toBe(0);
    expect(outcome.floored).toEqual(["a", "b"]);
  });
});

describe("resolvePrinting", () => {
  const nameEn = bandWithStamp(SIGNATURE_WIDTH, 36, 1);
  const nameSc = bandWithStamp(SIGNATURE_WIDTH, 36, 9);
  const codeOgn = bandWithStamp(CODE_SIGNATURE_WIDTH, 21, 2);
  const codeUnl = bandWithStamp(CODE_SIGNATURE_WIDTH, 21, 7);

  /**
   * Bundle two band signatures into a printing signature.
   *
   * @returns The signature struct.
   */
  function bands(name: GrayImage, code: GrayImage | null): PrintingSignature {
    return { name, code };
  }

  /**
   * A collector-code lookup: the leading "en-"/"sc-" language tag does not
   * change the code, mirroring the real catalogue.
   *
   * @returns The code, e.g. "ogn" for both "en-ogn" and "sc-ogn".
   */
  function codeOf(key: string): string {
    return key.replace(/^(?:en|sc)-?/u, "") || "ogn";
  }

  it("resolves by name band alone when it separates everything", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["sc-ogn", bands(nameSc, codeOgn)],
      ]),
      codeOf,
    );
    expect(resolution?.key).toBe("en-ogn");
    expect(resolution?.via).toBe("name");
    expect(resolution?.indistinguishable).toEqual([]);
  });

  it("resolves within the name-band class through the code strip", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["en-unl", bands(nameEn, codeUnl)],
        ["sc-ogn", bands(nameSc, codeOgn)],
      ]),
      codeOf,
    );
    expect(resolution?.key).toBe("en-ogn");
    expect(resolution?.via).toBe("code");
    expect(resolution?.indistinguishable).toEqual([]);
  });

  it("resolves a same-language reprint group the name band is blind to", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeUnl, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["en-unl", bands(nameEn, codeUnl)],
      ]),
      codeOf,
    );
    expect(resolution?.key).toBe("en-unl");
    expect(resolution?.via).toBe("code");
  });

  it("skips the code stage without a collector-code lookup", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeUnl, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["en-unl", bands(nameEn, codeUnl)],
      ]),
    );
    expect(resolution).toBeNull();
  });

  it("never compares strips of printings sharing a collector code", () => {
    // Two languages of ONE printing: same printed code, but the render files
    // differ in provenance (simulated by genuinely different strip pixels).
    // The name stage is blind (identical name bands, like an unregisterable
    // scan pair) and the code stage must not manufacture evidence from the
    // provenance difference.
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["sc-ogn", bands(nameEn, codeUnl)],
      ]),
      codeOf,
    );
    expect(resolution).toBeNull();
  });

  it("keeps the name pick when the code strip cannot separate the class", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1)),
      new Map([
        ["en-a", bands(nameEn, codeOgn)],
        ["en-b", bands(nameEn, codeOgn)],
        ["sc-a", bands(nameSc, codeOgn)],
      ]),
      () => "shared-code",
    );
    expect(resolution?.via).toBe("name");
    expect(resolution?.key === "en-a" || resolution?.key === "en-b").toBe(true);
    expect(resolution?.indistinguishable.length).toBe(1);
  });

  it("abstains outright when no candidate clears the name floor", () => {
    const garbage = bandWithStamp(SIGNATURE_WIDTH, 36, 0);
    for (let i = 0; i < garbage.data.length; i++) {
      garbage.data[i] = (i * 31) % 251;
    }
    const resolution = resolvePrinting(
      bands(garbage, shifted(codeOgn, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["en-unl", bands(nameEn, codeUnl)],
      ]),
      codeOf,
    );
    expect(resolution).toBeNull();
  });

  it("does not let the code strip decide when name evidence exists but is ambiguous", () => {
    // A query name band sitting exactly between the two languages: name
    // pairs evaluate but no side clears the margin, so the group might be
    // cross-language with a corrupt band — the code strip must not pick
    // anyway, even though the candidate codes differ.
    const between = bandWithStamp(SIGNATURE_WIDTH, 36, 0);
    for (let i = 0; i < between.data.length; i++) {
      between.data[i] = Math.round((nameEn.data[i] + nameSc.data[i]) / 2);
    }
    const resolution = resolvePrinting(
      bands(between, shifted(codeOgn, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn)],
        ["sc-unl", bands(nameSc, codeUnl)],
      ]),
      codeOf,
    );
    expect(resolution).toBeNull();
  });
});
