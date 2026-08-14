import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { SEARCH_RESULT_LIMIT, moveQueueEntry, searchPrintingsByName } from "./card-queue-search";

const yasuo = stubPrinting({
  id: "p-yasuo",
  cardId: "c-yasuo",
  publicCode: "OGN-142",
  card: { name: "Yasuo" },
});
const resolve = stubPrinting({
  id: "p-resolve",
  cardId: "c-resolve",
  publicCode: "OGN-088",
  card: { name: "Yasuo's Resolve" },
});
const wind = stubPrinting({
  id: "p-wind",
  cardId: "c-wind",
  publicCode: "OGN-201",
  card: { name: "Wind Wall" },
});
const poro = stubPrinting({
  id: "p-poro",
  cardId: "c-poro",
  publicCode: "OGN-300",
  card: { name: "Snack Time for Yasuo" },
});

const catalog = [yasuo, resolve, wind, poro];

describe("searchPrintingsByName", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(searchPrintingsByName("", catalog)).toEqual([]);
    expect(searchPrintingsByName("   ", catalog)).toEqual([]);
  });

  it("ranks exact, then prefix, then substring matches", () => {
    const result = searchPrintingsByName("yasuo", catalog);

    expect(result.map((printing) => printing.id)).toEqual(["p-yasuo", "p-resolve", "p-poro"]);
  });

  it("is case insensitive", () => {
    expect(searchPrintingsByName("WIND", catalog)).toHaveLength(1);
    expect(searchPrintingsByName("WIND", catalog)[0]?.id).toBe("p-wind");
  });

  it("matches on the public code", () => {
    expect(searchPrintingsByName("ogn-201", catalog)[0]?.id).toBe("p-wind");
  });

  it("returns one row per card, keeping the first printing offered", () => {
    const altArt = stubPrinting({
      id: "p-yasuo-alt",
      cardId: "c-yasuo",
      publicCode: "OGN-142b",
      card: { name: "Yasuo" },
    });

    const result = searchPrintingsByName("yasuo", [yasuo, altArt]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p-yasuo");
  });

  it("prefers a better-ranked printing of the same card over an earlier weak one", () => {
    const weak = stubPrinting({
      id: "p-weak",
      cardId: "c-same",
      publicCode: "ZZZ-001",
      card: { name: "A Tale of Yasuo" },
    });
    const strong = stubPrinting({
      id: "p-strong",
      cardId: "c-same",
      publicCode: "ZZZ-002",
      card: { name: "Yasuo" },
    });

    const result = searchPrintingsByName("yasuo", [weak, strong]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p-strong");
  });

  it("keeps a card's first-seen position when a later printing upgrades its rank", () => {
    // Card A appears first (substring match), card B second (prefix match),
    // then a later printing of A also matches as a prefix. Within the prefix
    // bucket, A must still sort before B — the upgrade must not push A behind
    // cards discovered after its first printing.
    const aWeak = stubPrinting({
      id: "p-a-weak",
      cardId: "c-a",
      publicCode: "AAA-001",
      card: { name: "A Tale of Yasuo" },
    });
    const b = stubPrinting({
      id: "p-b",
      cardId: "c-b",
      publicCode: "BBB-001",
      card: { name: "Yasuo's Resolve" },
    });
    const aStrong = stubPrinting({
      id: "p-a-strong",
      cardId: "c-a",
      publicCode: "AAA-002",
      card: { name: "Yasuo, the Unforgiven" },
    });

    const result = searchPrintingsByName("yasuo", [aWeak, b, aStrong]);

    expect(result.map((printing) => printing.id)).toEqual(["p-a-strong", "p-b"]);
  });

  it("drops non-matches", () => {
    expect(searchPrintingsByName("zaun", catalog)).toEqual([]);
  });

  it("caps the result count", () => {
    const many = Array.from({ length: SEARCH_RESULT_LIMIT + 15 }, (_unused, index) =>
      stubPrinting({ id: `p-${index}`, cardId: `c-${index}`, card: { name: `Poro ${index}` } }),
    );

    expect(searchPrintingsByName("poro", many)).toHaveLength(SEARCH_RESULT_LIMIT);
  });

  it("honors an explicit limit", () => {
    expect(searchPrintingsByName("yasuo", catalog, 2)).toHaveLength(2);
  });
});

describe("moveQueueEntry", () => {
  const ids = ["a", "b", "c"];

  it("moves an entry down", () => {
    expect(moveQueueEntry(ids, 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("moves an entry up", () => {
    expect(moveQueueEntry(ids, 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the ends", () => {
    expect(moveQueueEntry(ids, 0, -1)).toEqual(ids);
    expect(moveQueueEntry(ids, 2, 1)).toEqual(ids);
  });

  it("is a no-op for an out-of-range source", () => {
    expect(moveQueueEntry(ids, 9, -1)).toEqual(ids);
    expect(moveQueueEntry(ids, -1, 1)).toEqual(ids);
  });

  it("does not mutate the input", () => {
    const original = [...ids];
    moveQueueEntry(ids, 0, 1);
    expect(ids).toEqual(original);
  });

  it("handles an empty queue", () => {
    expect(moveQueueEntry([], 0, 1)).toEqual([]);
  });
});
