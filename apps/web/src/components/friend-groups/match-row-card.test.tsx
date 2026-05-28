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

const { MatchRowCard } = await import("./match-row-card");
type AggregatedMatch = Parameters<typeof MatchRowCard>[0]["match"];

function makeMatch(): AggregatedMatch {
  return {
    counterpartyUserId: "user-1",
    counterpartyName: "Alice",
    counterpartyImage: null,
    counterpartyGravatarHash: "abc",
    counterpartyNickname: null,
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
});
