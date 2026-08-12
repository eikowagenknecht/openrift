import type { Printing } from "@openrift/shared";
import { setIndexById, UNKNOWN_SET_INDEX } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { compareCatalogPosition, comparePrintingIdsByCatalog } from "@/lib/catalog-position";
import { stubPrinting } from "@/test/factories";

const SETS = [{ id: "set-founders" }, { id: "set-origins" }, { id: "set-unleashed" }];

function catalog(printings: Printing[]): Record<string, Printing> {
  return Object.fromEntries(printings.map((printing) => [printing.id, printing]));
}

describe("compareCatalogPosition", () => {
  it("orders by set before card number", () => {
    const early = { setIndex: 0, shortCode: "FND-249" };
    const late = { setIndex: 1, shortCode: "OGN-001" };
    expect(compareCatalogPosition(early, late)).toBeLessThan(0);
    expect(compareCatalogPosition(late, early)).toBeGreaterThan(0);
  });

  it("orders zero-padded numbers numerically within a set", () => {
    const sorted = [
      { setIndex: 1, shortCode: "OGN-010" },
      { setIndex: 1, shortCode: "OGN-002" },
      { setIndex: 1, shortCode: "OGN-100" },
    ].toSorted(compareCatalogPosition);
    expect(sorted.map((position) => position.shortCode)).toEqual(["OGN-002", "OGN-010", "OGN-100"]);
  });

  it("treats an identical position as equal", () => {
    const position = { setIndex: 2, shortCode: "UNL-007" };
    expect(compareCatalogPosition(position, { ...position })).toBe(0);
  });
});

describe("comparePrintingIdsByCatalog", () => {
  const founders = stubPrinting({ id: "p-fnd", setId: "set-founders", shortCode: "FND-249" });
  const originsLow = stubPrinting({ id: "p-ogn-2", setId: "set-origins", shortCode: "OGN-002" });
  const originsHigh = stubPrinting({ id: "p-ogn-10", setId: "set-origins", shortCode: "OGN-010" });
  const printings = catalog([founders, originsLow, originsHigh]);

  it("sorts printing ids by set, then card number", () => {
    const compare = comparePrintingIdsByCatalog(printings, SETS);
    const sorted = ["p-ogn-10", "p-fnd", "p-ogn-2"].toSorted(compare);
    expect(sorted).toEqual(["p-fnd", "p-ogn-2", "p-ogn-10"]);
  });

  it("sorts a printing the catalog doesn't have last", () => {
    const compare = comparePrintingIdsByCatalog(printings, SETS);
    const sorted = ["p-missing", "p-ogn-2"].toSorted(compare);
    expect(sorted).toEqual(["p-ogn-2", "p-missing"]);
  });

  it("sorts a printing from a set the catalog doesn't have last", () => {
    const stray = stubPrinting({ id: "p-stray", setId: "set-nope", shortCode: "AAA-001" });
    const compare = comparePrintingIdsByCatalog(catalog([stray, originsLow]), SETS);
    const sorted = ["p-stray", "p-ogn-2"].toSorted(compare);
    expect(sorted).toEqual(["p-ogn-2", "p-stray"]);
  });

  it("sorts a supplemental set's printings after the main sets", () => {
    // The set order is main-first, then catalog order — the same order the
    // grid's set headers use — so a promo printed before a main set still
    // sorts behind it.
    const promo = stubPrinting({ id: "p-promo", setId: "set-promo", shortCode: "PRM-001" });
    const compare = comparePrintingIdsByCatalog(catalog([promo, founders]), [
      { id: "set-promo", setType: "supplemental" },
      { id: "set-founders", setType: "main" },
    ]);
    expect(["p-promo", "p-fnd"].toSorted(compare)).toEqual(["p-fnd", "p-promo"]);
  });

  it("keeps unknown printings in their original order", () => {
    const compare = comparePrintingIdsByCatalog(printings, SETS);
    expect(compare("p-missing-a", "p-missing-b")).toBe(0);
  });

  it("reports the unknown position as the last set index", () => {
    // Guards the sentinel the comparator leans on: any real set index must sort
    // ahead of it.
    expect(setIndexById(SETS).get("set-unleashed")).toBeLessThan(UNKNOWN_SET_INDEX);
  });
});
