import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { LoanResponse } from "@openrift/shared/types/api/loan";
import { describe, expect, it } from "vitest";

import { cardHoldingLines } from "@/lib/card-holdings";

function loan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: "loan-1",
    role: "lender",
    counterparty: null,
    counterpartyName: "Ashe",
    printingId: "p1",
    cardId: "c1",
    quantity: 1,
    returnedQuantity: 0,
    status: "active",
    acknowledgedAt: "2026-09-01T00:00:00.000Z",
    rejectedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    closedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "p1",
    role: "giver",
    phase: "reserved",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

function textOf(lines: readonly { text: string }[]): string[] {
  return lines.map((line) => line.text);
}

describe("cardHoldingLines", () => {
  it("returns nothing when no loan or trade touches the card", () => {
    expect(cardHoldingLines({ loans: [], annotations: [], printingIds: ["p1"] })).toEqual([]);
  });

  it("names the borrower of a lent-out loan", () => {
    const lines = cardHoldingLines({
      loans: [loan({ quantity: 2, counterpartyName: "Ashe" })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual(["Lent 2 copies to Ashe"]);
  });

  it("folds several loans to the same borrower into one line", () => {
    const lines = cardHoldingLines({
      loans: [
        loan({ id: "a", printingId: "p1", quantity: 1 }),
        loan({ id: "b", printingId: "p2", quantity: 2 }),
      ],
      annotations: [],
      printingIds: ["p1", "p2"],
    });
    expect(textOf(lines)).toEqual(["Lent 3 copies to Ashe"]);
  });

  it("counts only the copies still out", () => {
    const lines = cardHoldingLines({
      loans: [loan({ quantity: 3, returnedQuantity: 2 })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual(["Lent 1 copy to Ashe"]);
  });

  it("drops a fully returned loan", () => {
    const lines = cardHoldingLines({
      loans: [loan({ quantity: 2, returnedQuantity: 2 })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(lines).toEqual([]);
  });

  it("drops a closed loan", () => {
    const lines = cardHoldingLines({
      loans: [loan({ status: "returned" })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(lines).toEqual([]);
  });

  it("names the lender of a borrowed loan", () => {
    const lines = cardHoldingLines({
      loans: [loan({ role: "borrower", counterparty: null, counterpartyName: "Jinx" })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual(["Borrowed 1 copy from Jinx"]);
  });

  it("leaves an unacknowledged borrowed loan out", () => {
    const lines = cardHoldingLines({
      loans: [loan({ role: "borrower", acknowledgedAt: null })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(lines).toEqual([]);
  });

  it("falls back to a placeholder for a departed member", () => {
    const lines = cardHoldingLines({
      loans: [loan({ counterparty: null, counterpartyName: null })],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual(["Lent 1 copy to Former member"]);
  });

  it("splits trade phases instead of collapsing them onto the most committed word", () => {
    const lines = cardHoldingLines({
      loans: [],
      annotations: [
        annotation({ role: "giver", phase: "asked", quantity: 3 }),
        annotation({ role: "giver", phase: "reserved", quantity: 1 }),
      ],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual(["Reserved · 1 copy outgoing", "Requested · 3 copies outgoing"]);
  });

  it("keeps the two sides of a trade apart", () => {
    const lines = cardHoldingLines({
      loans: [],
      annotations: [
        annotation({ role: "receiver", phase: "reserved", quantity: 2 }),
        annotation({ role: "giver", phase: "reserved", quantity: 1 }),
      ],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual(["Reserved · 1 copy outgoing", "Reserved · 2 copies incoming"]);
  });

  it("marks a bid nobody acted on as soft and everything else as committed", () => {
    const lines = cardHoldingLines({
      loans: [loan()],
      annotations: [
        annotation({ phase: "asked" }),
        annotation({ phase: "offered" }),
        annotation({ phase: "reserved" }),
      ],
      printingIds: ["p1"],
    });
    expect(lines.map((line) => line.tone)).toEqual(["committed", "committed", "committed", "soft"]);
  });

  it("sums a trade across the printings the detail covers", () => {
    const lines = cardHoldingLines({
      loans: [],
      annotations: [
        annotation({ printingId: "p1", quantity: 1 }),
        annotation({ printingId: "p2", quantity: 2 }),
      ],
      printingIds: ["p1", "p2"],
    });
    expect(textOf(lines)).toEqual(["Reserved · 3 copies outgoing"]);
  });

  it("ignores loans and trades on printings the detail does not cover", () => {
    const lines = cardHoldingLines({
      loans: [loan({ printingId: "other" })],
      annotations: [annotation({ printingId: "other" })],
      printingIds: ["p1"],
    });
    expect(lines).toEqual([]);
  });

  it("orders lent, then borrowed, then trades", () => {
    const lines = cardHoldingLines({
      loans: [
        loan({ id: "a", role: "borrower", counterpartyName: "Jinx" }),
        loan({ id: "b", role: "lender", counterpartyName: "Ashe" }),
      ],
      annotations: [annotation()],
      printingIds: ["p1"],
    });
    expect(textOf(lines)).toEqual([
      "Lent 1 copy to Ashe",
      "Borrowed 1 copy from Jinx",
      "Reserved · 1 copy outgoing",
    ]);
  });

  it("gives the two loan directions different icons", () => {
    const lines = cardHoldingLines({
      loans: [
        loan({ id: "a", role: "lender", counterpartyName: "Ashe" }),
        loan({ id: "b", role: "borrower", counterpartyName: "Jinx" }),
      ],
      annotations: [],
      printingIds: ["p1"],
    });
    expect(lines[0]!.icon).not.toBe(lines[1]!.icon);
  });
});
