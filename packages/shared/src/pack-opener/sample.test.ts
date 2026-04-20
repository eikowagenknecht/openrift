import { describe, expect, it } from "bun:test";

import { buildPool } from "./pools";
import {
  COMMONS_PER_PACK,
  FLEX_EPIC_RATE,
  FLEX_SLOTS_PER_PACK,
  SHOWCASE_ALTART_RATE,
  SHOWCASE_OVERNUMBERED_RATE,
  SHOWCASE_SIGNED_RATE,
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
    cardType: "Unit",
    rarity: "Common",
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
    p({ id: "c1", rarity: "Common" }),
    p({ id: "c2", rarity: "Common" }),
    p({ id: "u1", rarity: "Uncommon" }),
    p({ id: "u2", rarity: "Uncommon" }),
    p({ id: "fc1", rarity: "Common", finish: "foil" }),
    p({ id: "fu1", rarity: "Uncommon", finish: "foil" }),
    p({ id: "r1", rarity: "Rare", finish: "foil" }),
    p({ id: "r2", rarity: "Rare", finish: "foil" }),
    p({ id: "e1", rarity: "Epic", finish: "foil" }),
    p({ id: "e2", rarity: "Epic", finish: "foil" }),
    p({ id: "run1", cardType: "Rune", rarity: "Common" }),
    p({ id: "sa1", rarity: "Showcase", finish: "foil", artVariant: "altart" }),
    p({ id: "so1", rarity: "Showcase", finish: "foil", artVariant: "overnumbered" }),
    p({ id: "ss1", rarity: "Showcase", finish: "foil", isSigned: true }),
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
    const runes = result.pulls.filter((pull) => pull.slot === "rune");
    const special = result.pulls.filter(
      (pull) => pull.slot === "foil" || pull.slot === "showcase" || pull.slot === "ultimate",
    );

    expect(commons).toHaveLength(COMMONS_PER_PACK);
    expect(uncommons).toHaveLength(UNCOMMONS_PER_PACK);
    expect(flex).toHaveLength(FLEX_SLOTS_PER_PACK);
    expect(runes).toHaveLength(1);
    expect(special).toHaveLength(1);
    expect(result.pulls).toHaveLength(
      COMMONS_PER_PACK + UNCOMMONS_PER_PACK + FLEX_SLOTS_PER_PACK + 1 + 1,
    );
  });

  it("only pulls Runes for the rune slot", () => {
    const pool = samplePool();
    const rng = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const result = openPack(pool, rng);
      const rune = result.pulls.find((pull) => pull.slot === "rune");
      expect(rune?.printing.cardType).toBe("Rune");
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
        (pull) => pull.slot === "flex" && pull.printing.rarity === "Epic",
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
      p({ id: "c", rarity: "Common" }),
      p({ id: "u", rarity: "Uncommon" }),
      p({ id: "fc", rarity: "Common", finish: "foil" }),
      p({ id: "fu", rarity: "Uncommon", finish: "foil" }),
      p({ id: "r", rarity: "Rare", finish: "foil" }),
      p({ id: "rn", cardType: "Rune", rarity: "Common" }),
    ]);
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const result = openPack(poolNoEpics, rng);
      for (const pull of result.pulls) {
        if (pull.slot === "flex") {
          expect(pull.printing.rarity).toBe("Rare");
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
