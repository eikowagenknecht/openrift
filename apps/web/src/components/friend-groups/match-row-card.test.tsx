import type { Marketplace, MarketplaceInfo } from "@openrift/shared";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

const { MatchRowCard, groupTradeMatches } = await import("./match-row-card");
type AggregatedMatch = Parameters<typeof MatchRowCard>[0]["match"];
type DirectedMatch = Parameters<typeof groupTradeMatches>[0][number];

function makeMatch(): AggregatedMatch {
  return {
    counterpartyUserId: "user-1",
    counterpartyName: "Alice",
    counterpartyImage: null,
    counterpartyGravatarHash: "abc",
    counterpartyListId: "list-1",
    counterpartyListName: "Spare Foils",
    sellEntryId: "sell-entry-1",
    sellListId: "list-1",
    copyId: "copy-1",
    printingId: "printing-1",
    cardId: "card-1",
    cardName: "Fury Rune",
    cardType: "unit",
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
    setName: "Origins",
    rarityLabel: "Common",
    finishLabel: "Foil",
    availableCount: 1,
  };
}

function makeMarketplaceInfos(): Record<Marketplace, MarketplaceInfo> {
  return {
    tcgplayer: { available: true, productId: 42 },
    cardmarket: { available: true, productId: 99 },
    cardtrader: { available: false, productId: null },
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
    expect(groups[0].variants).toHaveLength(3);
    expect(groups[0].totalAvailable).toBe(25);
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
    expect(groups[0].foldId).not.toBe(groups[1].foldId);
  });

  it("does not merge incoming and outgoing rows of the same card", () => {
    const groups = groupTradeMatches([
      makeDirected({ direction: "incoming", printingId: "printing-a" }),
      makeDirected({ direction: "outgoing", printingId: "printing-a" }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("MatchRowCard", () => {
  // Regression test: the card used to wrap everything in a single <Link>,
  // which caused a hydration error because MatchPreferenceCell renders its
  // marketplace text as an external <a>. Nested anchors are invalid HTML.
  it("does not nest anchors when preference lines render marketplace links", () => {
    const { container } = render(
      <MatchRowCard match={makeMatch()} marketplaceInfos={makeMarketplaceInfos()} />,
    );
    expect(container.querySelectorAll("a").length).toBeGreaterThan(1);
    expect(container.querySelector("a a")).toBeNull();
  });

  it("prefixes the title with the wanted quantity and labels the available count", () => {
    const { container } = render(
      <MatchRowCard
        match={{ ...makeMatch(), buyQuantity: 2, availableCount: 7 }}
        marketplaceInfos={makeMarketplaceInfos()}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("2× Fury Rune");
    expect(text).toContain("×7 available");
  });
});
