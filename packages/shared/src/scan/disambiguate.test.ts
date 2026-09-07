import { describe, expect, it } from "vitest";

import type { PrintingSignature } from "./disambiguate";
import {
  CODE_SIGNATURE_WIDTH,
  SIGNATURE_WIDTH,
  STAMP_SIGNATURE_WIDTH,
  bestShiftCorrelation,
  codeStripSignature,
  correlateSignatures,
  discriminativeMargin,
  printingSignature,
  resolvePrinting,
  runPrintingTournament,
  stampBandSignature,
  textRegionSignature,
} from "./disambiguate";
import type { GrayImage, RgbaImage } from "./types";

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

function shifted(signature: GrayImage, offset: number): GrayImage {
  const { width, height } = signature;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(height - 1, Math.max(0, y + offset));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1, Math.max(0, x + offset));
      data[y * width + x] = signature.data[sy * width + sx]!;
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

describe("stampBandSignature", () => {
  it("produces a signature at full query resolution", () => {
    const signature = stampBandSignature(fullSizeCard(1));
    expect(signature?.width).toBe(STAMP_SIGNATURE_WIDTH);
    expect(signature?.height).toBeGreaterThanOrEqual(16);
    expect(signature?.height).toBeLessThanOrEqual(44);
  });

  it("abstains when the band would need upscaling", () => {
    expect(stampBandSignature(cardWithTextPattern(1))).toBeNull();
  });

  it("abstains on landscape images", () => {
    const landscape: RgbaImage = {
      data: new Uint8ClampedArray(528 * 384 * 4),
      width: 528,
      height: 384,
    };
    expect(stampBandSignature(landscape)).toBeNull();
  });
});

describe("printingSignature", () => {
  it("carries all bands at full resolution and only the name band below it", () => {
    const full = printingSignature(fullSizeCard(1));
    expect(full?.name).toBeTruthy();
    expect(full?.code).toBeTruthy();
    expect(full?.stamp).toBeTruthy();
    const small = printingSignature(cardWithTextPattern(1));
    expect(small?.name).toBeTruthy();
    expect(small?.code).toBeNull();
    expect(small?.stamp).toBeNull();
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
  const stampPlain = bandWithStamp(STAMP_SIGNATURE_WIDTH, 30, 4);
  const stampPromo = bandWithStamp(STAMP_SIGNATURE_WIDTH, 30, 11);

  function bands(
    name: GrayImage,
    code: GrayImage | null,
    stamp: GrayImage | null = null,
  ): PrintingSignature {
    return { name, code, stamp };
  }

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

  function markerKeyOf(key: string): string | undefined {
    if (key.endsWith("-mixed")) {
      return undefined;
    }
    return key.endsWith("-promo") ? "promo" : "";
  }

  it("resolves a same-code marker pair through the stamp band", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1), shifted(stampPromo, 1)),
      new Map([
        ["en-base", bands(nameEn, codeOgn, stampPlain)],
        ["en-promo", bands(nameEn, codeOgn, stampPromo)],
      ]),
      () => "shared-code",
      markerKeyOf,
    );
    expect(resolution?.key).toBe("en-promo");
    expect(resolution?.via).toBe("stamp");
  });

  it("resolves through the stamp band within the name band's class", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1), shifted(stampPlain, 1)),
      new Map([
        ["en-base", bands(nameEn, codeOgn, stampPlain)],
        ["en-promo", bands(nameEn, codeOgn, stampPromo)],
        ["sc-base", bands(nameSc, codeOgn, stampPlain)],
      ]),
      () => "shared-code",
      markerKeyOf,
    );
    expect(resolution?.key).toBe("en-base");
    expect(resolution?.via).toBe("stamp");
  });

  it("never compares stamps of printings sharing a marker set", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1), shifted(stampPlain, 1)),
      new Map([
        ["en-base", bands(nameEn, codeOgn, stampPlain)],
        ["en-other", bands(nameEn, codeOgn, stampPromo)],
      ]),
      () => "shared-code",
      () => "",
    );
    expect(resolution).toBeNull();
  });

  it("treats a mixed-marker render as carrying no stamp evidence", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1), shifted(stampPromo, 1)),
      new Map([
        ["en-mixed", bands(nameEn, codeOgn, stampPlain)],
        ["en-promo", bands(nameEn, codeOgn, stampPromo)],
      ]),
      () => "shared-code",
      markerKeyOf,
    );
    expect(resolution).toBeNull();
  });

  it("skips the stamp stage without a marker lookup", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1), shifted(stampPromo, 1)),
      new Map([
        ["en-base", bands(nameEn, codeOgn, stampPlain)],
        ["en-promo", bands(nameEn, codeOgn, stampPromo)],
      ]),
      () => "shared-code",
    );
    expect(resolution).toBeNull();
  });

  it("never compares stamps of two differently-marked variants", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeOgn, 1), shifted(stampPromo, 1)),
      new Map([
        ["en-summoner", bands(nameEn, codeOgn, stampPromo)],
        ["en-champion", bands(nameEn, codeOgn, stampPlain)],
      ]),
      () => "shared-code",
      (key) => (key.endsWith("-summoner") ? "summoner" : "champion+summoner"),
    );
    expect(resolution).toBeNull();
  });

  it("treats known-equal languages as carrying no name evidence", () => {
    const provenanceA = bandWithStamp(SIGNATURE_WIDTH, 36, 1);
    const provenanceB = bandWithStamp(SIGNATURE_WIDTH, 36, 5);
    const resolution = resolvePrinting(
      bands(shifted(provenanceA, 1), null, shifted(stampPromo, 1)),
      new Map([
        ["en-base", bands(provenanceB, null, stampPlain)],
        ["en-promo", bands(provenanceA, null, stampPromo)],
      ]),
      undefined,
      markerKeyOf,
      () => "EN",
    );
    expect(resolution?.key).toBe("en-promo");
    expect(resolution?.via).toBe("stamp");
  });

  it("still separates languages when the language lookup is present", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), null, null),
      new Map([
        ["en-ogn", bands(nameEn, null, null)],
        ["sc-ogn", bands(nameSc, null, null)],
      ]),
      undefined,
      undefined,
      (key) => (key.startsWith("en-") ? "EN" : "SC"),
    );
    expect(resolution?.key).toBe("en-ogn");
    expect(resolution?.via).toBe("name");
  });

  it("prefers code evidence over the stamp band when codes differ", () => {
    const resolution = resolvePrinting(
      bands(shifted(nameEn, 1), shifted(codeUnl, 1), shifted(stampPromo, 1)),
      new Map([
        ["en-ogn", bands(nameEn, codeOgn, stampPlain)],
        ["en-unl-promo", bands(nameEn, codeUnl, stampPromo)],
      ]),
      codeOf,
      markerKeyOf,
    );
    expect(resolution?.key).toBe("en-unl-promo");
    expect(resolution?.via).toBe("code");
  });

  it("does not let the stamp band decide when name evidence exists but is ambiguous", () => {
    const between = bandWithStamp(SIGNATURE_WIDTH, 36, 0);
    for (let i = 0; i < between.data.length; i++) {
      between.data[i] = Math.round((nameEn.data[i]! + nameSc.data[i]!) / 2);
    }
    const resolution = resolvePrinting(
      bands(between, null, shifted(stampPromo, 1)),
      new Map([
        ["en-promo", bands(nameEn, null, stampPromo)],
        ["sc-base", bands(nameSc, null, stampPlain)],
      ]),
      undefined,
      markerKeyOf,
    );
    expect(resolution).toBeNull();
  });

  it("does not let the code strip decide when name evidence exists but is ambiguous", () => {
    const between = bandWithStamp(SIGNATURE_WIDTH, 36, 0);
    for (let i = 0; i < between.data.length; i++) {
      between.data[i] = Math.round((nameEn.data[i]! + nameSc.data[i]!) / 2);
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
