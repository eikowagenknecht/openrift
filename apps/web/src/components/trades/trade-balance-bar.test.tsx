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
    groupName: "The Group",
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

// The spacer between the two rail segments carries no inline style, so the
// style attribute is what tells segments apart from it.
function segments(container: HTMLElement): [HTMLElement, HTMLElement] | null {
  const found = container.querySelectorAll<HTMLElement>("span[style]");
  return found.length === 2 ? [found[0]!, found[1]!] : null;
}

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
