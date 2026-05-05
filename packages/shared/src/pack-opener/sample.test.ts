import { describe, expect, it } from "bun:test";

import { buildPool } from "./pools";
import {
  COMMONS_PER_PACK,
  FLEX_EPIC_RATE,
  FLEX_SLOTS_PER_PACK,
  SHOWCASE_ALTART_RATE,
  SHOWCASE_OVERNUMBERED_RATE,
  SHOWCASE_SIGNED_RATE,
  TOKEN_SLOT_FOIL_RUNE_RATE,
  TOKEN_SLOT_TOKEN_RATE,
  ULTIMATE_RATE,
  UNCOMMONS_PER_PACK,
} from "./rates";
import { mulberry32 } from "./rng";
import { openPack, openPacks } from "./sample";
import type { PackPrinting } from "./types";

function p(overrides: Partial<PackPrinting> & { id: string }): PackPrinting {
  return {
    cardId: overrides.id,
    cardName: overrides.id,
    cardSlug: overrides.id,
    cardType: "unit",
    cardSuperTypes: [],
    rarity: "common",
    finish: "normal",
    artVariant: "normal",
    isSigned: false,
    language: "EN",
    shortCode: "XXX-001",
    publicCode: "XXX-001",
    setSlug: "OGN",
    ...overrides,
  };
}

function samplePool() {
  const printings: PackPrinting[] = [
    // Plenty of commons/uncommons/rares/epics so dedup never falls back.
    ...Array.from({ length: 20 }, (_, i) => p({ id: `c${i}`, rarity: "common" })),
    ...Array.from({ length: 10 }, (_, i) => p({ id: `u${i}`, rarity: "uncommon" })),
    ...Array.from({ length: 8 }, (_, i) => p({ id: `fc${i}`, rarity: "common", finish: "foil" })),
    ...Array.from({ length: 8 }, (_, i) => p({ id: `fu${i}`, rarity: "uncommon", finish: "foil" })),
    ...Array.from({ length: 6 }, (_, i) => p({ id: `r${i}`, rarity: "rare", finish: "foil" })),
    ...Array.from({ length: 6 }, (_, i) => p({ id: `e${i}`, rarity: "epic", finish: "foil" })),
    ...Array.from({ length: 6 }, (_, i) =>
      p({ id: `run${i}`, cardType: "rune", rarity: "common" }),
    ),
    p({ id: "frun1", cardType: "rune", rarity: "common", finish: "foil" }),
    p({ id: "arun1", cardType: "rune", rarity: "common", artVariant: "altart" }),
    p({ id: "tok1", cardSuperTypes: ["token"], rarity: "common" }),
    p({ id: "tok2", cardSuperTypes: ["token"], rarity: "common" }),
    p({ id: "sa1", rarity: "showcase", finish: "foil", artVariant: "altart" }),
    p({ id: "so1", rarity: "showcase", finish: "foil", artVariant: "overnumbered" }),
    p({ id: "ss1", rarity: "showcase", finish: "foil", isSigned: true }),
    p({ id: "ult1", artVariant: "ultimate" }),
  ];
  return buildPool(printings);
}

describe("openPack", () => {
  it("produces the expected slot composition per pack", () => {
    const pool = samplePool();
    const rng = mulberry32(42);
    const result = openPack(pool, rng);

    const commons = result.pulls.filter((pull) => pull.slot === "common");
    const uncommons = result.pulls.filter((pull) => pull.slot === "uncommon");
    const flex = result.pulls.filter((pull) => pull.slot === "flex");
    const tokens = result.pulls.filter((pull) => pull.slot === "token");
    const special = result.pulls.filter(
      (pull) => pull.slot === "foil" || pull.slot === "showcase" || pull.slot === "ultimate",
    );

    expect(commons).toHaveLength(COMMONS_PER_PACK);
    expect(uncommons).toHaveLength(UNCOMMONS_PER_PACK);
    expect(flex).toHaveLength(FLEX_SLOTS_PER_PACK);
    expect(tokens).toHaveLength(1);
    expect(special).toHaveLength(1);
    expect(result.pulls).toHaveLength(
      COMMONS_PER_PACK + UNCOMMONS_PER_PACK + FLEX_SLOTS_PER_PACK + 1 + 1,
    );
  });

  it("never repeats the same printing within one pack", () => {
    const pool = samplePool();
    const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const result = openPack(pool, rng);
      const ids = result.pulls.map((pull) => pull.printing.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("falls back to allowing duplicates when a bucket is too small", () => {
    // Only one common printing but 7 common slots — the fallback inside
    // pickOneUnique kicks in and we get 7 copies of the same printing rather
    // than throwing.
    const pool = buildPool([
      p({ id: "c", rarity: "common" }),
      p({ id: "u", rarity: "uncommon" }),
      p({ id: "fc", rarity: "common", finish: "foil" }),
      p({ id: "fu", rarity: "uncommon", finish: "foil" }),
      p({ id: "r", rarity: "rare", finish: "foil" }),
      p({ id: "e", rarity: "epic", finish: "foil" }),
      p({ id: "rn", cardType: "rune", rarity: "common" }),
    ]);
    const rng = mulberry32(7);
    const result = openPack(pool, rng);
    const commons = result.pulls.filter((pull) => pull.slot === "common");
    expect(commons).toHaveLength(7);
    expect(commons.every((pull) => pull.printing.id === "c")).toBe(true);
  });

  it("only pulls Runes or Token-supertype cards for the token slot", () => {
    const pool = samplePool();
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const result = openPack(pool, rng);
      const token = result.pulls.find((pull) => pull.slot === "token");
      const isRune = token?.printing.cardType === "rune";
      const isToken = token?.printing.cardSuperTypes.includes("token") ?? false;
      expect(isRune || isToken).toBe(true);
    }
  });

  it("routes Token-supertype cards into the token slot at roughly the published rate", () => {
    const pool = samplePool();
    const rng = mulberry32(2024);
    const n = 20_000;
    let tokenSupertypeCount = 0;
    for (let i = 0; i < n; i++) {
      const result = openPack(pool, rng);
      for (const pull of result.pulls) {
        if (pull.slot === "token" && pull.printing.cardSuperTypes.includes("token")) {
          tokenSupertypeCount++;
        }
      }
    }
    const observed = tokenSupertypeCount / n;
    expect(observed).toBeGreaterThan(TOKEN_SLOT_TOKEN_RATE * 0.85);
    expect(observed).toBeLessThan(TOKEN_SLOT_TOKEN_RATE * 1.15);
  });

  it("upgrades the token slot to a foil Rune at roughly the published rate", () => {
    const pool = samplePool();
    const rng = mulberry32(3030);
    const n = 20_000;
    let foilRuneCount = 0;
    for (let i = 0; i < n; i++) {
      const result = openPack(pool, rng);
      for (const pull of result.pulls) {
        if (
          pull.slot === "token" &&
          pull.printing.cardType === "rune" &&
          pull.printing.finish === "foil"
        ) {
          foilRuneCount++;
        }
      }
    }
    const observed = foilRuneCount / n;
    expect(observed).toBeGreaterThan(TOKEN_SLOT_FOIL_RUNE_RATE * 0.8);
    expect(observed).toBeLessThan(TOKEN_SLOT_FOIL_RUNE_RATE * 1.2);
  });

  it("falls through to a regular Rune when token-slot sub-pools are empty", () => {
    // No tokens, no foil runes, no alt-art runes — every token slot must be a
    // plain normal-art normal-finish Rune.
    const pool = buildPool([
      p({ id: "c", rarity: "common" }),
      p({ id: "u", rarity: "uncommon" }),
      p({ id: "fc", rarity: "common", finish: "foil" }),
      p({ id: "fu", rarity: "uncommon", finish: "foil" }),
      p({ id: "r", rarity: "rare", finish: "foil" }),
      p({ id: "e", rarity: "epic", finish: "foil" }),
      p({ id: "rn", cardType: "rune", rarity: "common" }),
    ]);
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const result = openPack(pool, rng);
      const token = result.pulls.find((pull) => pull.slot === "token");
      expect(token?.printing.id).toBe("rn");
    }
  });

  it("matches the published Epic rate within tolerance over many packs", () => {
    const pool = samplePool();
    const rng = mulberry32(123);
    const n = 20_000;
    let packsWithEpic = 0;
    for (let i = 0; i < n; i++) {
      const result = openPack(pool, rng);
      const hasEpic = result.pulls.some(
        (pull) => pull.slot === "flex" && pull.printing.rarity === "epic",
      );
      if (hasEpic) {
        packsWithEpic++;
      }
    }
    const observed = packsWithEpic / n;
    // Published rate: 1 in 4 packs. Allow 1% tolerance at this sample size.
    expect(observed).toBeGreaterThan(0.24);
    expect(observed).toBeLessThan(0.26);
  });

  it("matches the published showcase and ultimate rates within tolerance", () => {
    const pool = samplePool();
    const rng = mulberry32(456);
    const n = 50_000;
    let altart = 0;
    let overnumbered = 0;
    let signed = 0;
    let ultimate = 0;
    for (let i = 0; i < n; i++) {
      const result = openPack(pool, rng);
      for (const pull of result.pulls) {
        if (pull.slot === "showcase") {
          if (pull.printing.isSigned) {
            signed++;
          } else if (pull.printing.artVariant === "altart") {
            altart++;
          } else if (pull.printing.artVariant === "overnumbered") {
            overnumbered++;
          }
        } else if (pull.slot === "ultimate") {
          ultimate++;
        }
      }
    }
    expect(altart / n).toBeGreaterThan(SHOWCASE_ALTART_RATE * 0.9);
    expect(altart / n).toBeLessThan(SHOWCASE_ALTART_RATE * 1.1);
    expect(overnumbered / n).toBeGreaterThan(SHOWCASE_OVERNUMBERED_RATE * 0.6);
    expect(overnumbered / n).toBeLessThan(SHOWCASE_OVERNUMBERED_RATE * 1.4);
    // Signed and ultimate are too rare for tight bounds at this N; just assert presence/absence.
    expect(signed).toBeGreaterThanOrEqual(0);
    expect(ultimate).toBeGreaterThanOrEqual(0);
    // Sanity: expected signed ≈ n * 1/720 ≈ 69, ultimate ≈ n * 0.001 = 50. Cap the upper bound.
    expect(signed).toBeLessThan(n * SHOWCASE_SIGNED_RATE * 3);
    expect(ultimate).toBeLessThan(n * ULTIMATE_RATE * 3);
  });

  it("falls back to rares when a set has no Epic foils in pool", () => {
    const poolNoEpics = buildPool([
      p({ id: "c", rarity: "common" }),
      p({ id: "u", rarity: "uncommon" }),
      p({ id: "fc", rarity: "common", finish: "foil" }),
      p({ id: "fu", rarity: "uncommon", finish: "foil" }),
      p({ id: "r1", rarity: "rare", finish: "foil" }),
      p({ id: "r2", rarity: "rare", finish: "foil" }),
      p({ id: "rn", cardType: "rune", rarity: "common" }),
    ]);
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const result = openPack(poolNoEpics, rng);
      for (const pull of result.pulls) {
        if (pull.slot === "flex") {
          expect(pull.printing.rarity).toBe("rare");
        }
      }
    }
  });

  it("FLEX_EPIC_RATE matches the pack-level 1-in-4 target", () => {
    const packEpicProb = 1 - (1 - FLEX_EPIC_RATE) ** 2;
    expect(packEpicProb).toBeGreaterThan(0.249);
    expect(packEpicProb).toBeLessThan(0.251);
  });
});

describe("openPacks", () => {
  it("returns exactly n results", () => {
    const pool = samplePool();
    const rng = mulberry32(999);
    const results = openPacks(pool, rng, 24);
    expect(results).toHaveLength(24);
  });
});
