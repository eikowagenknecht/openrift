import { describe, expect, it } from "vitest";

import type { SearchableCard, SearchablePrintingCodes } from "./card-search.js";
import {
  buildCardIndex,
  findCard,
  matchesCardQuery,
  resolveCard,
  searchCards,
} from "./card-search.js";

const cards: SearchableCard[] = [
  { id: "c1", slug: "jinx-rebel", name: "Jinx, Rebel" },
  { id: "c2", slug: "jinx-loose-cannon", name: "Jinx, Loose Cannon" },
  { id: "c3", slug: "dorans-shield", name: "Doran’s Shield" },
  { id: "c4", slug: "mecha-jinx", name: "Mecha Jinx" },
  { id: "c5", slug: "viktor", name: "Viktor" },
  { id: "c7", slug: "annie-dark-child", name: "Annie, Dark Child" },
];

const printingsByCardId = new Map<string, SearchablePrintingCodes[]>([
  ["c1", [{ shortCode: "OGN-202", publicCode: "OGN-202/298" }]],
  ["c5", [{ shortCode: "OGN-045", publicCode: "OGN-045/298" }]],
]);

function indexFor(list: SearchableCard[] = cards) {
  return buildCardIndex(list, printingsByCardId);
}

const index = indexFor();

describe("searchCards", () => {
  it("puts an exact match before prefix and substring matches", () => {
    const results = searchCards(
      indexFor([...cards, { id: "c6", slug: "jinx", name: "Jinx" }]),
      "jinx",
      10,
    );
    expect(results[0]?.name).toBe("Jinx");
  });

  it("matches printing short codes and public codes, dashes optional", () => {
    expect(searchCards(index, "OGN-202", 10).map((c) => c.id)).toEqual(["c1"]);
    expect(searchCards(index, "ogn202", 10).map((c) => c.id)).toEqual(["c1"]);
    expect(searchCards(index, "ogn202298", 10).map((c) => c.id)).toEqual(["c1"]);
  });

  it("ranks code prefix matches after name prefix matches", () => {
    expect(searchCards(index, "ogn", 10).map((c) => c.id)).toEqual(["c1", "c5"]);
  });

  it("puts prefix matches before substring matches", () => {
    const results = searchCards(index, "jinx", 10);
    expect(results.map((c) => c.name)).toEqual(["Jinx, Loose Cannon", "Jinx, Rebel", "Mecha Jinx"]);
  });

  it("matches case-insensitively", () => {
    expect(searchCards(index, "VIKTOR", 10)).toHaveLength(1);
  });

  it("matches a keyboard apostrophe against the typographic one in card names", () => {
    expect(searchCards(index, "doran's shield", 10).map((c) => c.slug)).toEqual(["dorans-shield"]);
  });

  it("matches with the apostrophe omitted entirely", () => {
    expect(searchCards(index, "dorans", 10).map((c) => c.slug)).toEqual(["dorans-shield"]);
  });

  it("returns empty for a blank or whitespace query", () => {
    expect(searchCards(index, "", 10)).toEqual([]);
    expect(searchCards(index, "   ", 10)).toEqual([]);
  });

  it("returns empty when nothing matches", () => {
    expect(searchCards(index, "teemo", 10)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchCards(index, "jinx", 2)).toHaveLength(2);
  });

  it("ranks a word-boundary hit above a mid-word one", () => {
    const results = searchCards(
      indexFor([
        { id: "m1", slug: "unjinxed", name: "Unjinxed" },
        { id: "m2", slug: "mecha-jinx", name: "Mecha Jinx" },
      ]),
      "jinx",
      10,
    );
    expect(results.map((c) => c.slug)).toEqual(["mecha-jinx", "unjinxed"]);
  });

  it("matches every token regardless of the order they were typed in", () => {
    expect(searchCards(index, "dark annie", 10).map((c) => c.slug)).toEqual(["annie-dark-child"]);
    expect(searchCards(index, "child annie", 10).map((c) => c.slug)).toEqual(["annie-dark-child"]);
  });

  it("ranks a contiguous match above an out-of-order one", () => {
    const results = searchCards(
      indexFor([
        { id: "t1", slug: "dark-annie", name: "Dark Annie" },
        { id: "t2", slug: "annie-dark-child", name: "Annie, Dark Child" },
      ]),
      "dark annie",
      10,
    );
    expect(results.map((c) => c.slug)).toEqual(["dark-annie", "annie-dark-child"]);
  });

  it("lets one token match a name and another a printing code", () => {
    expect(searchCards(index, "rebel ogn202", 10).map((c) => c.id)).toEqual(["c1"]);
  });

  it("still requires every token to match", () => {
    expect(searchCards(index, "annie teemo", 10)).toEqual([]);
  });

  it("matches a printing code as a substring", () => {
    expect(searchCards(index, "202", 10).map((c) => c.id)).toEqual(["c1"]);
  });

  it("keeps the caller's richer card type on the way out", () => {
    const richIndex = buildCardIndex(
      [{ id: "c5", slug: "viktor", name: "Viktor", energy: 3 }],
      printingsByCardId,
    );
    expect(searchCards(richIndex, "viktor", 1)[0]?.energy).toBe(3);
  });
});

describe("findCard", () => {
  it("resolves an exact slug directly", () => {
    expect(findCard(index, "jinx-rebel")?.id).toBe("c1");
  });

  it("falls back to the best free-text match", () => {
    expect(findCard(index, "viktor")?.id).toBe("c5");
  });

  it("returns undefined when nothing matches", () => {
    expect(findCard(index, "teemo")).toBeUndefined();
  });
});

describe("altNames", () => {
  const legendIndex = buildCardIndex(
    [
      {
        id: "c-azir",
        slug: "emperor-of-the-sands",
        name: "Emperor of the Sands",
        altNames: ["Azir, Emperor of the Sands"],
      },
      {
        id: "c-kindred",
        slug: "twin-souls",
        name: "Twin Souls",
        altNames: ["Kindred, Twin Souls", "Lamb, Twin Souls"],
      },
    ],
    new Map(),
  );

  it("finds a Legend by its colloquial champion form", () => {
    expect(searchCards(legendIndex, "Azir, Emperor of the Sands", 5).map((c) => c.id)).toEqual([
      "c-azir",
    ]);
  });

  it("still finds it by the stored name", () => {
    expect(searchCards(legendIndex, "Emperor of the Sands", 5).map((c) => c.id)).toEqual([
      "c-azir",
    ]);
  });

  it("finds it by the champion alone", () => {
    expect(searchCards(legendIndex, "azir", 5).map((c) => c.id)).toEqual(["c-azir"]);
  });

  it("matches any of a Legend's several champion forms", () => {
    expect(searchCards(legendIndex, "Kindred, Twin Souls", 5).map((c) => c.id)).toEqual([
      "c-kindred",
    ]);
    expect(searchCards(legendIndex, "Lamb, Twin Souls", 5).map((c) => c.id)).toEqual(["c-kindred"]);
  });

  it("scores an alt-name hit at the tier that name reaches", () => {
    const tierIndex = buildCardIndex(
      [
        { id: "c-1", slug: "a", name: "Emperor of the Sands", altNames: ["Azir, Emperor"] },
        { id: "c-2", slug: "b", name: "Azir, Emperor of Shurima" },
      ],
      new Map(),
    );
    expect(searchCards(tierIndex, "Azir, Emperor", 5).map((c) => c.id)).toEqual(["c-1", "c-2"]);
  });

  it("matches an already-normalized alias key typed with punctuation", () => {
    const aliasIndex = buildCardIndex(
      [{ id: "c-1", slug: "a", name: "Blazing Scorcher", altNames: ["blazingscorcherpromo"] }],
      new Map(),
    );
    expect(searchCards(aliasIndex, "Blazing Scorcher Promo", 5).map((c) => c.id)).toEqual(["c-1"]);
  });
});

describe("resolveCard", () => {
  const resolveIndex = buildCardIndex(
    [
      { id: "c-annie", slug: "annie", name: "Annie" },
      { id: "c-annie-dark", slug: "annie-dark-child", name: "Annie, Dark Child" },
      {
        id: "c-azir",
        slug: "emperor-of-the-sands",
        name: "Emperor of the Sands",
        altNames: ["Azir, Emperor of the Sands"],
      },
    ],
    new Map(),
  );

  it("matches an exact name even when longer names also contain it", () => {
    const result = resolveCard(resolveIndex, "Annie");
    expect(result).toEqual({ status: "matched", card: expect.objectContaining({ id: "c-annie" }) });
  });

  it("matches through an alt name", () => {
    const result = resolveCard(resolveIndex, "Azir, Emperor of the Sands");
    expect(result).toEqual({ status: "matched", card: expect.objectContaining({ id: "c-azir" }) });
  });

  it("matches across typographic punctuation", () => {
    const curly = buildCardIndex([{ id: "c-1", slug: "a", name: "Doran’s Shield" }], new Map());
    expect(resolveCard(curly, "Doran's Shield").status).toBe("matched");
  });

  it("reports a tie as ambiguous instead of guessing", () => {
    const result = resolveCard(resolveIndex, "Anni");
    expect(result.status).toBe("ambiguous");
    expect(result.status === "ambiguous" && result.candidates.map((c) => c.id)).toEqual([
      "c-annie",
      "c-annie-dark",
    ]);
  });

  it("reports nothing found as unmatched", () => {
    expect(resolveCard(resolveIndex, "Teemo")).toEqual({ status: "unmatched" });
  });

  it("treats an empty or punctuation-only name as unmatched", () => {
    expect(resolveCard(resolveIndex, "").status).toBe("unmatched");
    expect(resolveCard(resolveIndex, "  ").status).toBe("unmatched");
    expect(resolveCard(resolveIndex, "'''").status).toBe("unmatched");
  });
});

describe("matchesCardQuery", () => {
  it("matches across typographic punctuation the user cannot type", () => {
    expect(matchesCardQuery("doran's shield", ["Doran’s Shield"])).toBe(true);
    expect(matchesCardQuery("dorans shield", ["Doran’s Shield"])).toBe(true);
  });

  it("is the case the raw toLowerCase().includes filters used to miss", () => {
    expect("Doran’s Shield".toLowerCase().includes("doran's")).toBe(false);
    expect(matchesCardQuery("doran's", ["Doran’s Shield"])).toBe(true);
  });

  it("accepts tokens in any order", () => {
    expect(matchesCardQuery("dark annie", ["Annie, Dark Child"])).toBe(true);
    expect(matchesCardQuery("annie dark", ["Annie, Dark Child"])).toBe(true);
  });

  it("requires every token to land somewhere", () => {
    expect(matchesCardQuery("annie teemo", ["Annie, Dark Child"])).toBe(false);
  });

  it("lets tokens land in different values", () => {
    expect(matchesCardQuery("annie ogn202", ["Annie, Dark Child", "OGN-202"])).toBe(true);
  });

  it("matches a code typed without its separator", () => {
    expect(matchesCardQuery("ogn202", ["Annie", "OGN-202"])).toBe(true);
  });

  it("folds accents and expands ligatures", () => {
    expect(matchesCardQuery("epee", ["Épée Guard"])).toBe(true);
    expect(matchesCardQuery("strasse", ["Straße"])).toBe(true);
  });

  it("keeps non-Latin values searchable", () => {
    expect(matchesCardQuery("莺之歌", ["莺之歌"])).toBe(true);
  });

  it("matches everything on an empty or punctuation-only query", () => {
    expect(matchesCardQuery("", ["Annie"])).toBe(true);
    expect(matchesCardQuery("   ", ["Annie"])).toBe(true);
    expect(matchesCardQuery("'''", ["Annie"])).toBe(true);
  });

  it("skips nullish values without matching them", () => {
    expect(matchesCardQuery("annie", [null, undefined, ""])).toBe(false);
    expect(matchesCardQuery("annie", [null, "Annie"])).toBe(true);
  });

  it("returns false against an empty value list", () => {
    expect(matchesCardQuery("annie", [])).toBe(false);
  });
});
