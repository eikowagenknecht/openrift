import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import { loadReferenceData } from "./reference-data.js";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sets = [
  { id: "set-1", name: "Alpha Set" },
  { id: "set-2", name: "Beta Set" },
];

const cards = [
  { id: "card-1", name: "Fire Dragon" },
  { id: "card-2", name: "Ice Golem" },
];

const printings = [
  {
    id: "p-1",
    cardId: "card-1",
    setId: "set-1",
    shortCode: "ALP-001",
    publicCode: "ALP-001",
    finish: "normal",
    artVariant: "standard",
    isSigned: false,
  },
  {
    id: "p-2",
    cardId: "card-1",
    setId: "set-1",
    shortCode: "ALP-001",
    publicCode: "ALP-001",
    finish: "foil",
    artVariant: "standard",
    isSigned: false,
  },
  {
    id: "p-3",
    cardId: "card-2",
    setId: "set-2",
    shortCode: "BET-001",
    publicCode: "BET-001",
    finish: "normal",
    artVariant: "alternate",
    isSigned: true,
  },
];

function createMockRepos(): Repos {
  return {
    priceRefresh: {
      allSets: vi.fn().mockResolvedValue(sets),
      allCards: vi.fn().mockResolvedValue(cards),
      allPrintingsForPriceMatch: vi.fn().mockResolvedValue(printings),
    },
  } as unknown as Repos;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadReferenceData", () => {
  it("returns raw sets, cards, and printings from the repos", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    expect(result.sets).toBe(sets);
    expect(result.cards).toBe(cards);
    expect(result.printings).toBe(printings);
  });

  it("builds setNameById lookup map", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    expect(result.setNameById.get("set-1")).toBe("Alpha Set");
    expect(result.setNameById.get("set-2")).toBe("Beta Set");
    expect(result.setNameById.size).toBe(2);
  });

  it("builds cardNameById lookup map", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    expect(result.cardNameById.get("card-1")).toBe("Fire Dragon");
    expect(result.cardNameById.get("card-2")).toBe("Ice Golem");
    expect(result.cardNameById.size).toBe(2);
  });

  it("builds namesBySet with normalized card names per set", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    // set-1 should have "firedragon" -> "card-1" (from printings p-1 and p-2)
    const set1Map = result.namesBySet.get("set-1");
    expect(set1Map).toBeDefined();
    expect(set1Map!.get("firedragon")).toBe("card-1");

    // set-2 should have "icegolem" -> "card-2"
    const set2Map = result.namesBySet.get("set-2");
    expect(set2Map).toBeDefined();
    expect(set2Map!.get("icegolem")).toBe("card-2");
  });

  it("does not duplicate namesBySet entry when multiple printings share the same card in a set", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    // card-1 has two printings in set-1 — should only appear once
    const set1Map = result.namesBySet.get("set-1");
    expect(set1Map!.size).toBe(1);
  });

  it("builds printingsByCardSetFinish coarse lookup map", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    // card-1|set-1|normal -> ["p-1"]
    expect(result.printingsByCardSetFinish.get("card-1|set-1|normal")).toEqual(["p-1"]);
    // card-1|set-1|foil -> ["p-2"]
    expect(result.printingsByCardSetFinish.get("card-1|set-1|foil")).toEqual(["p-2"]);
    // card-2|set-2|normal -> ["p-3"]
    expect(result.printingsByCardSetFinish.get("card-2|set-2|normal")).toEqual(["p-3"]);
  });

  it("accumulates multiple printings under the same coarse key", async () => {
    // Two printings with different artVariant but same card/set/finish
    const duplicatePrintings = [
      { ...printings[0], id: "p-dup-1", artVariant: "standard", isSigned: false },
      { ...printings[0], id: "p-dup-2", artVariant: "alternate", isSigned: false },
    ];
    const repos = {
      priceRefresh: {
        allSets: vi.fn().mockResolvedValue(sets),
        allCards: vi.fn().mockResolvedValue(cards),
        allPrintingsForPriceMatch: vi.fn().mockResolvedValue(duplicatePrintings),
      },
    } as unknown as Repos;

    const result = await loadReferenceData(repos);
    expect(result.printingsByCardSetFinish.get("card-1|set-1|normal")).toEqual([
      "p-dup-1",
      "p-dup-2",
    ]);
  });

  it("builds printingByFullKey exact lookup map", async () => {
    const repos = createMockRepos();
    const result = await loadReferenceData(repos);

    expect(result.printingByFullKey.get("card-1|set-1|normal|standard|false")).toBe("p-1");
    expect(result.printingByFullKey.get("card-1|set-1|foil|standard|false")).toBe("p-2");
    expect(result.printingByFullKey.get("card-2|set-2|normal|alternate|true")).toBe("p-3");
  });

  it("skips namesBySet entry when card name is not found in cardNameById", async () => {
    const orphanPrintings = [
      {
        id: "p-orphan",
        cardId: "card-unknown",
        setId: "set-1",
        shortCode: "ALP-999",
        publicCode: "ALP-999",
        finish: "normal",
        artVariant: "standard",
        isSigned: false,
      },
    ];
    const repos = {
      priceRefresh: {
        allSets: vi.fn().mockResolvedValue(sets),
        allCards: vi.fn().mockResolvedValue(cards),
        allPrintingsForPriceMatch: vi.fn().mockResolvedValue(orphanPrintings),
      },
    } as unknown as Repos;

    const result = await loadReferenceData(repos);

    // The set map should exist (created when iterating printings) but have no entries
    // because the card name lookup failed
    const set1Map = result.namesBySet.get("set-1");
    expect(set1Map).toBeDefined();
    expect(set1Map!.size).toBe(0);
  });

  it("handles empty data from repos", async () => {
    const repos = {
      priceRefresh: {
        allSets: vi.fn().mockResolvedValue([]),
        allCards: vi.fn().mockResolvedValue([]),
        allPrintingsForPriceMatch: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Repos;

    const result = await loadReferenceData(repos);

    expect(result.sets).toEqual([]);
    expect(result.cards).toEqual([]);
    expect(result.printings).toEqual([]);
    expect(result.setNameById.size).toBe(0);
    expect(result.cardNameById.size).toBe(0);
    expect(result.namesBySet.size).toBe(0);
    expect(result.printingsByCardSetFinish.size).toBe(0);
    expect(result.printingByFullKey.size).toBe(0);
  });
});
