import { describe, expect, it } from "vitest";

import type { MinimalCard } from "./custom-tag-bulk-import";
import { planCustomTagBulkImport } from "./custom-tag-bulk-import";

const CARDS: MinimalCard[] = [
  { id: "card-1", name: "Brazen Buccaneer" },
  { id: "card-2", name: "Riptide Rex" },
  { id: "card-3", name: "Miss Fortune, Buccaneer" },
  { id: "card-4", name: "Miss Fortune, Captain" },
  { id: "card-5", name: "Pouty Poro" },
];

describe("planCustomTagBulkImport", () => {
  it("returns empty plan for empty input", () => {
    const plan = planCustomTagBulkImport("", CARDS);
    expect(plan.cardIds).toEqual([]);
    expect(plan.matched).toEqual([]);
    expect(plan.unmatched).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it("resolves the standard 1-prefix decklist format", () => {
    const text = "1 Brazen Buccaneer\n1 Riptide Rex\n1 Pouty Poro";
    const plan = planCustomTagBulkImport(text, CARDS);
    expect(plan.cardIds).toEqual(["card-1", "card-2", "card-5"]);
    expect(plan.unmatched).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it("resolves multi-count entries the same as count=1 (quantity is ignored for tagging)", () => {
    const plan = planCustomTagBulkImport("3 Brazen Buccaneer", CARDS);
    expect(plan.cardIds).toEqual(["card-1"]);
  });

  it("ignores case and punctuation variation via normalizeNameForMatching", () => {
    const plan = planCustomTagBulkImport("1 miss fortune buccaneer", CARDS);
    expect(plan.cardIds).toEqual(["card-3"]);
  });

  it("dedupes the same card appearing twice in the input", () => {
    const plan = planCustomTagBulkImport("1 Pouty Poro\n1 Pouty Poro", CARDS);
    expect(plan.cardIds).toEqual(["card-5"]);
    expect(plan.matched).toHaveLength(1);
  });

  it("reports unmatched names without crashing", () => {
    const plan = planCustomTagBulkImport("1 Brazen Buccaneer\n1 Not A Real Card", CARDS);
    expect(plan.cardIds).toEqual(["card-1"]);
    expect(plan.unmatched).toEqual(["Not A Real Card"]);
  });

  it("surfaces ambiguous names instead of silently picking one", () => {
    const collision: MinimalCard[] = [
      { id: "a", name: "Mystery Card" },
      { id: "b", name: "Mystery Card" },
    ];
    const plan = planCustomTagBulkImport("1 Mystery Card", collision);
    expect(plan.cardIds).toEqual([]);
    expect(plan.ambiguous).toEqual([
      {
        name: "Mystery Card",
        matches: [
          { cardId: "a", name: "Mystery Card" },
          { cardId: "b", name: "Mystery Card" },
        ],
      },
    ]);
  });

  it("treats bare lines (no leading count) as quantity 1", () => {
    const plan = planCustomTagBulkImport("Brazen Buccaneer\nRiptide Rex", CARDS);
    expect(plan.cardIds).toEqual(["card-1", "card-2"]);
    expect(plan.unmatched).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("propagates parser warnings for unknown zone headers", () => {
    const plan = planCustomTagBulkImport("Mystery Zone:\n1 Brazen Buccaneer", CARDS);
    expect(plan.cardIds).toEqual(["card-1"]);
    expect(plan.warnings.some((w) => w.includes("Mystery Zone"))).toBe(true);
  });

  it("skips blank lines without warning", () => {
    const plan = planCustomTagBulkImport("\n1 Pouty Poro\n\n", CARDS);
    expect(plan.cardIds).toEqual(["card-5"]);
    expect(plan.warnings).toEqual([]);
  });
});
