import { describe, expect, it } from "bun:test";

import { compactCatalog, hydrateCatalog } from "./compact.js";
import type { RiftboundCatalog } from "./types/index.js";

const fullCatalog: RiftboundCatalog = {
  sets: [{ id: "OGS", slug: "OGS", name: "Original Set" }],
  cards: {
    "OGS-001": {
      id: "OGS-001",
      slug: "OGS-001",
      name: "Fire Dragon",
      type: "Unit",
      superTypes: ["Champion"],
      domains: ["Fury"],
      might: 4,
      energy: 5,
      power: 6,
      mightBonus: null,
      keywords: ["Shield"],
      rulesText: "A fiery beast",
      effectText: null,
      tags: [],
    },
  },
  printings: [
    {
      id: "p1",
      slug: "p1",
      sourceId: "OGS-001",
      setId: "OGS",
      collectorNumber: 1,
      rarity: "Rare",
      artVariant: "normal",
      isSigned: false,
      isPromo: false,
      finish: "normal",
      images: [{ face: "front", url: "https://example.com/img.jpg" }],
      artist: "Alice",
      publicCode: "ABCD",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: "Roar!",
      cardId: "OGS-001",
    },
  ],
};

describe("compactCatalog", () => {
  it("strips null values from cards", () => {
    const compacted = compactCatalog(fullCatalog);
    const card = compacted.cards["OGS-001"];
    expect(card).not.toHaveProperty("mightBonus");
    expect(card).not.toHaveProperty("effectText");
  });

  it("strips empty arrays from cards", () => {
    const compacted = compactCatalog(fullCatalog);
    const card = compacted.cards["OGS-001"];
    expect(card).not.toHaveProperty("tags");
  });

  it("preserves non-null and non-empty values", () => {
    const compacted = compactCatalog(fullCatalog);
    const card = compacted.cards["OGS-001"];
    expect(card.name).toBe("Fire Dragon");
    expect(card.might).toBe(4);
    expect(card.superTypes).toEqual(["Champion"]);
    expect(card.keywords).toEqual(["Shield"]);
  });

  it("strips null values from printings", () => {
    const compacted = compactCatalog(fullCatalog);
    const printing = compacted.printings[0];
    expect(printing).not.toHaveProperty("printedRulesText");
    expect(printing).not.toHaveProperty("printedEffectText");
  });

  it("preserves non-null printing fields", () => {
    const compacted = compactCatalog(fullCatalog);
    const printing = compacted.printings[0];
    expect(printing.flavorText).toBe("Roar!");
    expect(printing.images).toEqual([{ face: "front", url: "https://example.com/img.jpg" }]);
  });

  it("preserves sets unchanged", () => {
    const compacted = compactCatalog(fullCatalog);
    expect(compacted.sets).toEqual(fullCatalog.sets);
  });
});

describe("hydrateCatalog", () => {
  it("restores null defaults for missing card fields", () => {
    const compacted = compactCatalog(fullCatalog);
    const hydrated = hydrateCatalog(compacted);
    const card = hydrated.cards["OGS-001"];
    expect(card.mightBonus).toBeNull();
    expect(card.effectText).toBeNull();
  });

  it("restores empty array defaults for missing card fields", () => {
    const compacted = compactCatalog(fullCatalog);
    const hydrated = hydrateCatalog(compacted);
    const card = hydrated.cards["OGS-001"];
    expect(card.tags).toEqual([]);
  });

  it("restores null defaults for missing printing fields", () => {
    const compacted = compactCatalog(fullCatalog);
    const hydrated = hydrateCatalog(compacted);
    const printing = hydrated.printings[0];
    expect(printing.printedRulesText).toBeNull();
    expect(printing.printedEffectText).toBeNull();
  });

  it("round-trips: compact then hydrate produces original data", () => {
    const roundTripped = hydrateCatalog(compactCatalog(fullCatalog));
    expect(roundTripped).toEqual(fullCatalog);
  });
});
