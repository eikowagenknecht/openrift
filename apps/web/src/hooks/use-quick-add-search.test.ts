import type { Printing } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { QuickAddCardResult } from "@/lib/quick-add-result";
import { stubPrinting } from "@/test/factories";

import { useQuickAddSearch } from "./use-quick-add-search";

function groupByCardId(printings: Printing[]): Map<string, Printing[]> {
  return Map.groupBy(printings, (p) => p.cardId);
}

function search(
  query: string,
  map: Map<string, Printing[]>,
  options?: Parameters<typeof useQuickAddSearch>[2],
): QuickAddCardResult[] {
  return renderHook(() => useQuickAddSearch(query, map, options)).result.current;
}

describe("useQuickAddSearch", () => {
  it("returns nothing for an empty query", () => {
    const map = groupByCardId([stubPrinting({ card: { name: "Ahri" } })]);
    expect(search("", map)).toEqual([]);
    expect(search("   ", map)).toEqual([]);
  });

  it("ranks exact matches above prefix and substring matches", () => {
    const exact = stubPrinting({ cardId: "card-exact", card: { name: "Ahri" } });
    const prefix = stubPrinting({ cardId: "card-prefix", card: { name: "Ahri the Fox" } });
    const substring = stubPrinting({ cardId: "card-substring", card: { name: "Vahri" } });
    const map = groupByCardId([prefix, substring, exact]);

    const results = search("ahri", map);

    expect(results.map((r) => r.cardId)).toEqual(["card-exact", "card-prefix", "card-substring"]);
  });

  it("matches every token regardless of the order they were typed in", () => {
    const annie = stubPrinting({ cardId: "card-annie", card: { name: "Annie, Dark Child" } });
    const map = groupByCardId([annie]);

    expect(search("dark annie", map).map((r) => r.cardId)).toEqual(["card-annie"]);
  });

  it("filters out printings in non-preferred languages and drops empty groups", () => {
    const ahriEn = stubPrinting({
      cardId: "card-ahri",
      language: "EN",
      card: { name: "Ahri" },
    });
    const ahriJa = stubPrinting({
      cardId: "card-ahri",
      language: "JA",
      card: { name: "Ahri" },
    });
    const yasuoJaOnly = stubPrinting({
      cardId: "card-yasuo",
      language: "JA",
      card: { name: "Yasuo" },
    });
    const map = groupByCardId([ahriEn, ahriJa, yasuoJaOnly]);

    const results = search("a", map, { preferredLanguages: ["EN"] });

    expect(results.map((r) => r.cardId)).toEqual(["card-ahri"]);
    expect(results[0]!.printings).toEqual([ahriEn]);
  });

  it("treats an empty preferredLanguages list as 'show all'", () => {
    const ahriJa = stubPrinting({
      cardId: "card-ahri",
      language: "JA",
      card: { name: "Ahri" },
    });
    const map = groupByCardId([ahriJa]);

    const results = search("ahri", map, { preferredLanguages: [] });

    expect(results.map((r) => r.cardId)).toEqual(["card-ahri"]);
  });

  it("sums ownedCount only over language-filtered printings", () => {
    const ahriEn = stubPrinting({
      id: "printing-en",
      cardId: "card-ahri",
      language: "EN",
      card: { name: "Ahri" },
    });
    const ahriJa = stubPrinting({
      id: "printing-ja",
      cardId: "card-ahri",
      language: "JA",
      card: { name: "Ahri" },
    });
    const map = groupByCardId([ahriEn, ahriJa]);

    const results = search("ahri", map, {
      ownedCountByPrinting: { "printing-en": 2, "printing-ja": 5 },
      preferredLanguages: ["EN"],
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.ownedCount).toBe(2);
  });

  it("respects the limit", () => {
    const map = groupByCardId([
      stubPrinting({ cardId: "c1", card: { name: "Ahri One" } }),
      stubPrinting({ cardId: "c2", card: { name: "Ahri Two" } }),
      stubPrinting({ cardId: "c3", card: { name: "Ahri Three" } }),
    ]);

    expect(search("ahri", map, { limit: 2 })).toHaveLength(2);
  });
});
