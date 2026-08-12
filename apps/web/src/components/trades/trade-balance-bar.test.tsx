import type { CardTradeResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TradeBalanceBar } from "@/components/trades/trade-balance-bar";

const { priceGetMock } = vi.hoisted(() => ({
  priceGetMock: vi.fn((_printingId: string): number | null | undefined => null),
}));

vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => ({ get: priceGetMock }),
}));

function trade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "group",
    role: "giver",
    initiator: "giver",
    counterparty: {
      userId: "user-2",
      name: "Robin",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    printingId: "printing-1",
    cardId: "card-1",
    quantity: 1,
    status: "pending",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    acceptedAt: null,
    completedAt: null,
    closedAt: null,
    expiresAt: null,
    viewerSyncAppliedAt: null,
    counterpartySyncAppliedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

/**
 * The two colored segments of the rail, in DOM order (give, then get). The
 * spacer between them carries no inline style, so the style attribute is what
 * separates the segments from it.
 * @returns The amber and green segments, or null when no bar was drawn.
 */
function segments(container: HTMLElement): [HTMLElement, HTMLElement] | null {
  const found = container.querySelectorAll<HTMLElement>("span[style]");
  return found.length === 2 ? [found[0]!, found[1]!] : null;
}

/** @returns A segment's flex-grow factor as a number. */
function grow(segment: HTMLElement): number {
  return Number(segment.style.flexGrow);
}

describe("TradeBalanceBar", () => {
  beforeEach(() => {
    priceGetMock.mockReset();
    priceGetMock.mockReturnValue(null);
  });

  it("renders nothing without a live trade", () => {
    const { container } = render(<TradeBalanceBar trades={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  // The bug: flex-grow factors are shares of the free space, and CSS hands out
  // only their sum of it when that sum is under 1. Feeding raw money in meant a
  // sub-1 deal drew a third of a bar and two thirds of bare track.
  it("fills the whole rail when the deal is worth less than one unit", () => {
    priceGetMock.mockReturnValue(0.16);
    const { container } = render(
      <TradeBalanceBar trades={[trade({ role: "receiver", quantity: 2 })]} />,
    );

    const bar = segments(container);
    expect(bar).not.toBeNull();
    const [give, get] = bar!;
    expect(grow(give) + grow(get)).toBeCloseTo(1);
    expect(grow(get)).toBeCloseTo(1);
    expect(grow(give)).toBeCloseTo(0);
  });

  it("splits the rail in proportion to the two sides' value", () => {
    priceGetMock.mockImplementation((printingId: string) =>
      printingId === "printing-out" ? 30 : 10,
    );
    const { container } = render(
      <TradeBalanceBar
        trades={[
          trade({ id: "out", role: "giver", printingId: "printing-out" }),
          trade({ id: "in", role: "receiver", printingId: "printing-in" }),
        ]}
      />,
    );

    const [give, get] = segments(container)!;
    expect(grow(give)).toBeCloseTo(0.75);
    expect(grow(get)).toBeCloseTo(0.25);
  });

  // Priced at zero on both sides is still a priced deal, so the bar draws — and
  // the share math must not divide by the zero total.
  it("draws an even split when both sides price at zero", () => {
    priceGetMock.mockReturnValue(0);
    const { container } = render(
      <TradeBalanceBar
        trades={[trade({ id: "out", role: "giver" }), trade({ id: "in", role: "receiver" })]}
      />,
    );

    const [give, get] = segments(container)!;
    expect(grow(give)).toBeCloseTo(0.5);
    expect(grow(get)).toBeCloseTo(0.5);
  });

  it("keeps the counts but drops the bar when neither side is priced", () => {
    priceGetMock.mockReturnValue(undefined);
    const { container } = render(
      <TradeBalanceBar trades={[trade({ role: "receiver", quantity: 2 })]} />,
    );

    expect(segments(container)).toBeNull();
    expect(screen.getByText(/You get/u)).toHaveTextContent("You get 2 cards");
    expect(screen.getByText(/You give/u)).toHaveTextContent("You give 0 cards");
  });
});
