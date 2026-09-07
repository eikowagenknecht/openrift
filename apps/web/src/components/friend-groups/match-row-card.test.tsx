import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { EnumLabels } from "@/lib/enum-labels";
import { countTradeSuggestions } from "@/lib/trade-derivation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const { compareMatchTradeGroups, groupTradeMatches, resolveMatchRows } =
  await import("./match-row-card");
type DirectedMatch = Parameters<typeof groupTradeMatches>[0][number];
type AggregatedMatch = Omit<DirectedMatch, "direction">;
type MatchTradeGroup = ReturnType<typeof groupTradeMatches>[number];

function makeMatch(): AggregatedMatch {
  return {
    groupSlug: "rift-crew",
    counterpartyUserId: "user-1",
    counterpartyName: "Alice",
    counterpartyImage: null,
    counterpartyGravatarHash: "abc",
    counterpartyListId: "list-1",
    counterpartyListName: "Spare Foils",
    viewerListName: "My Wishlist",
    sellEntryId: "sell-entry-1",
    sellListId: "list-1",
    copyId: "copy-1",
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    printingId: "printing-1",
    cardId: "card-1",
    cardName: "Fury Rune",
    setId: "set-1",
    rarity: "common",
    finish: "foil",
    imageId: null,
    buyEntryId: "buy-entry-1",
    buyListId: "list-2",
    buyEntryKind: "card",
    buyQuantity: 1,
    sellPref: {
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: null,
      currency: "EUR",
    },
    buyPref: {
      pricePref: "tcg_lowest",
      priceAbsoluteCents: null,
      tradeType: null,
      currency: "USD",
    },
    cardSlug: "fury-rune",
    shortCode: "OGN-001",
    setIndex: 3,
    setName: "Origins",
    rarityLabel: "Common",
    finishLabel: "Foil",
    domains: ["fury"],
    printing: null,
    availableCount: 1,
    copies: [{ condition: null, grader: null, grade: null, notesPublic: null }],
  };
}

function makeDirected(overrides: Partial<DirectedMatch> = {}): DirectedMatch {
  return { ...makeMatch(), direction: "incoming", ...overrides };
}

describe("groupTradeMatches", () => {
  it("collapses a card-level wish's variants from one member into a single group", () => {
    const groups = groupTradeMatches([
      makeDirected({ printingId: "printing-a", availableCount: 7 }),
      makeDirected({ printingId: "printing-b", availableCount: 1 }),
      makeDirected({ printingId: "printing-c", availableCount: 17 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.variants).toHaveLength(3);
    expect(groups[0]!.totalAvailable).toBe(25);
  });

  it("carries the card id its variants share", () => {
    const groups = groupTradeMatches([
      makeDirected({ printingId: "printing-a" }),
      makeDirected({ printingId: "printing-b" }),
    ]);
    expect(groups[0]!.cardId).toBe("card-1");
  });

  it("keeps printing-level wishes as separate one-variant groups", () => {
    const groups = groupTradeMatches([
      makeDirected({ buyEntryKind: "printing", printingId: "printing-a" }),
      makeDirected({ buyEntryKind: "printing", printingId: "printing-b" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.variants.length === 1)).toBe(true);
  });

  it("does not merge the same wish across different members", () => {
    const groups = groupTradeMatches([
      makeDirected({ counterpartyUserId: "user-1", printingId: "printing-a" }),
      makeDirected({ counterpartyUserId: "user-2", printingId: "printing-b" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.foldId).not.toBe(groups[1]!.foldId);
  });

  it("merges one wish reachable through two friend groups into a single tile", () => {
    const groups = groupTradeMatches([
      makeDirected({ groupSlug: "rift-crew", copyId: "copy-1", printingId: "printing-a" }),
      makeDirected({ groupSlug: "summoner-skirmish", copyId: "copy-2", printingId: "printing-a" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.variants.map((variant) => variant.groupSlug)).toEqual([
      "rift-crew",
      "summoner-skirmish",
    ]);
  });

  it("counts the same as the tiles it renders, across friend groups", () => {
    const rows = [
      makeDirected({ groupSlug: "rift-crew", copyId: "copy-1", printingId: "printing-a" }),
      makeDirected({ groupSlug: "summoner-skirmish", copyId: "copy-2", printingId: "printing-a" }),
    ];
    expect(groupTradeMatches(rows)).toHaveLength(countTradeSuggestions(rows, []));
  });

  it("does not merge incoming and outgoing rows of the same card", () => {
    const groups = groupTradeMatches([
      makeDirected({ direction: "incoming", printingId: "printing-a" }),
      makeDirected({ direction: "outgoing", printingId: "printing-a" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("orders a group's variants by set, then card number", () => {
    const groups = groupTradeMatches([
      makeDirected({ printingId: "printing-a", setIndex: 3, shortCode: "OGN-010" }),
      makeDirected({ printingId: "printing-b", setIndex: 1, shortCode: "FND-249" }),
      makeDirected({ printingId: "printing-c", setIndex: 3, shortCode: "OGN-002" }),
    ]);
    expect(groups[0]!.variants.map((variant) => variant.shortCode)).toEqual([
      "FND-249",
      "OGN-002",
      "OGN-010",
    ]);
  });

  it("gives a group the catalog position of its earliest variant", () => {
    const groups = groupTradeMatches([
      makeDirected({ printingId: "printing-a", setIndex: 3, shortCode: "OGN-010" }),
      makeDirected({ printingId: "printing-b", setIndex: 1, shortCode: "FND-249" }),
    ]);
    expect(groups[0]!.setIndex).toBe(1);
    expect(groups[0]!.shortCode).toBe("FND-249");
  });
});

describe("resolveMatchRows", () => {
  const LABELS: EnumLabels = {
    finishes: { foil: "Foil" },
    rarities: { common: "Common" },
    domains: {},
    cardTypes: {},
    superTypes: {},
    artVariants: {},
    cardSizes: {},
    conditions: {},
    graders: {},
  };
  type ListRow = Parameters<typeof resolveMatchRows>[0][number];

  function resolve(rows: ListRow[], groupNames: ReadonlyMap<string, string> | null) {
    return resolveMatchRows(rows, {}, {}, [], LABELS, "rift-crew", groupNames);
  }

  function makeListRow(overrides: Partial<ListRow> = {}): ListRow {
    return { ...makeMatch(), groupSlug: undefined, ...overrides } as ListRow;
  }

  it("names the row's own group, not the list's, when they differ", () => {
    const [row] = resolve(
      [makeListRow({ groupSlug: "summoner-skirmish" })],
      new Map([
        ["rift-crew", "Rift Crew"],
        ["summoner-skirmish", "Summoner Skirmish"],
      ]),
    );
    expect(row!.groupSlug).toBe("summoner-skirmish");
    expect(row!.groupLabel).toBe("Summoner Skirmish");
  });

  it("falls back to the list's group for a row that names none", () => {
    const [row] = resolve([makeListRow()], new Map([["rift-crew", "Rift Crew"]]));
    expect(row!.groupSlug).toBe("rift-crew");
    expect(row!.groupLabel).toBe("Rift Crew");
  });

  it("leaves rows unlabelled when the list covers a single group", () => {
    const [row] = resolve([makeListRow({ groupSlug: "summoner-skirmish" })], null);
    expect(row!.groupLabel).toBeUndefined();
  });
});

describe("compareMatchTradeGroups", () => {
  function makeGroup(overrides: Partial<MatchTradeGroup> = {}): MatchTradeGroup {
    return { ...groupTradeMatches([makeDirected()])[0]!, ...overrides };
  }

  it("sorts incoming before outgoing regardless of catalog position", () => {
    const sorted = [
      makeGroup({ direction: "outgoing", setIndex: 1, shortCode: "FND-249" }),
      makeGroup({ direction: "incoming", setIndex: 9, shortCode: "UNL-100" }),
    ].toSorted(compareMatchTradeGroups);
    expect(sorted.map((group) => group.direction)).toEqual(["incoming", "outgoing"]);
  });

  it("sorts by set order, then card number, within a direction", () => {
    const sorted = [
      makeGroup({ setIndex: 3, shortCode: "OGN-010" }),
      makeGroup({ setIndex: 3, shortCode: "OGN-002" }),
      makeGroup({ setIndex: 1, shortCode: "FND-249" }),
    ].toSorted(compareMatchTradeGroups);
    expect(sorted.map((group) => group.shortCode)).toEqual(["FND-249", "OGN-002", "OGN-010"]);
  });

  it("falls back to the card name when two groups share a catalog position", () => {
    const sorted = [
      makeGroup({ setIndex: Number.MAX_SAFE_INTEGER, shortCode: "", cardName: "Zed" }),
      makeGroup({ setIndex: Number.MAX_SAFE_INTEGER, shortCode: "", cardName: "Ahri" }),
    ].toSorted(compareMatchTradeGroups);
    expect(sorted.map((group) => group.cardName)).toEqual(["Ahri", "Zed"]);
  });
});
