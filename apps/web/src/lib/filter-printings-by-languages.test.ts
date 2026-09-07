import type { Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { filterPrintingsByLanguages } from "./filter-printings-by-languages";

function mapOf(...entries: [string, Printing[]][]): Map<string, Printing[]> {
  return new Map(entries);
}

describe("filterPrintingsByLanguages", () => {
  it("returns a distinct clone with every entry when no languages are given", () => {
    const enPrinting = stubPrinting({ cardId: "card-1", language: "EN" });
    const dePrinting = stubPrinting({ cardId: "card-1", language: "DE" });
    const source = mapOf(["card-1", [enPrinting, dePrinting]]);

    const result = filterPrintingsByLanguages(source, []);

    expect(result).not.toBe(source);
    expect([...result.keys()]).toEqual(["card-1"]);
    expect(result.get("card-1")).toEqual([enPrinting, dePrinting]);
  });

  it("keeps only printings whose language is allowed", () => {
    const enPrinting = stubPrinting({ cardId: "card-1", language: "EN" });
    const dePrinting = stubPrinting({ cardId: "card-1", language: "DE" });
    const frPrinting = stubPrinting({ cardId: "card-1", language: "FR" });
    const source = mapOf(["card-1", [enPrinting, dePrinting, frPrinting]]);

    const result = filterPrintingsByLanguages(source, ["EN"]);

    expect(result.get("card-1")).toEqual([enPrinting]);
  });

  it("drops cards with no printing in any allowed language", () => {
    const dePrinting = stubPrinting({ cardId: "card-1", language: "DE" });
    const enPrinting = stubPrinting({ cardId: "card-2", language: "EN" });
    const source = mapOf(["card-1", [dePrinting]], ["card-2", [enPrinting]]);

    const result = filterPrintingsByLanguages(source, ["EN"]);

    expect([...result.keys()]).toEqual(["card-2"]);
    expect(result.get("card-2")).toEqual([enPrinting]);
  });

  it("preserves the original printing order within a card", () => {
    const first = stubPrinting({ cardId: "card-1", language: "EN", canonicalRank: 0 });
    const skipped = stubPrinting({ cardId: "card-1", language: "DE", canonicalRank: 1 });
    const second = stubPrinting({ cardId: "card-1", language: "EN", canonicalRank: 2 });
    const source = mapOf(["card-1", [first, skipped, second]]);

    const result = filterPrintingsByLanguages(source, ["EN"]);

    expect(result.get("card-1")).toEqual([first, second]);
  });

  it("allows printings across multiple listed languages", () => {
    const enPrinting = stubPrinting({ cardId: "card-1", language: "EN" });
    const dePrinting = stubPrinting({ cardId: "card-1", language: "DE" });
    const jaPrinting = stubPrinting({ cardId: "card-1", language: "JA" });
    const source = mapOf(["card-1", [enPrinting, dePrinting, jaPrinting]]);

    const result = filterPrintingsByLanguages(source, ["EN", "DE"]);

    expect(result.get("card-1")).toEqual([enPrinting, dePrinting]);
  });
});
