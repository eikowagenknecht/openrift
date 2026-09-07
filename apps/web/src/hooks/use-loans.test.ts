import type { LoanResponse } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

// The hooks in use-loans.ts pull in server-fn machinery; the pure helper is
// what's under test, so stub the server-side modules the import graph touches.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({ middleware: () => ({ handler: () => () => {} }) }),
    middleware: () => ({ handler: () => () => {} }),
  }),
}));
vi.mock("@/lib/server-fns/middleware", () => ({ withCookies: () => {} }));
vi.mock("@/lib/server-fns/orpc-client", () => ({ apiOrpcClient: () => ({}) }));

const { aggregateBorrowedCounts, aggregateBorrowedLendersByCard } = await import("./use-loans");

function stubLoan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: `loan-${Math.random()}`,
    role: "borrower",
    counterparty: { userId: "u1", name: "Alice", image: null, gravatarHash: "gh" },
    counterpartyName: null,
    printingId: "p1",
    cardId: "c1",
    quantity: 2,
    returnedQuantity: 0,
    status: "active",
    acknowledgedAt: "2026-07-02T00:00:00Z",
    rejectedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    closedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

describe("aggregateBorrowedCounts", () => {
  it("sums outstanding quantities per printing across acknowledged loans", () => {
    const loans = [
      stubLoan({ printingId: "p1", quantity: 3, returnedQuantity: 1 }),
      stubLoan({ printingId: "p1", quantity: 1 }),
      stubLoan({ printingId: "p2", quantity: 2 }),
    ];
    expect(aggregateBorrowedCounts(loans)).toEqual({ p1: 3, p2: 2 });
  });

  it("ignores lender-role loans", () => {
    expect(aggregateBorrowedCounts([stubLoan({ role: "lender" })])).toEqual({});
  });

  it("ignores unconfirmed and closed loans", () => {
    const loans = [
      stubLoan({ acknowledgedAt: null }),
      stubLoan({ status: "returned" }),
      stubLoan({ status: "written_off" }),
    ];
    expect(aggregateBorrowedCounts(loans)).toEqual({});
  });

  it("drops fully returned loans even while still active", () => {
    expect(aggregateBorrowedCounts([stubLoan({ quantity: 2, returnedQuantity: 2 })])).toEqual({});
  });
});

describe("aggregateBorrowedLendersByCard", () => {
  it("collects lenders by card, not printing", () => {
    const loans = [
      stubLoan({ cardId: "c1", printingId: "p1" }),
      stubLoan({
        cardId: "c1",
        printingId: "p2",
        counterparty: null,
        counterpartyName: "Bob",
      }),
      stubLoan({ cardId: "c2", printingId: "p3" }),
    ];
    expect(aggregateBorrowedLendersByCard(loans)).toEqual({
      c1: ["Alice", "Bob"],
      c2: ["Alice"],
    });
  });

  it("names a lender once however many loans they hold", () => {
    const loans = [stubLoan({ cardId: "c1" }), stubLoan({ cardId: "c1" })];
    expect(aggregateBorrowedLendersByCard(loans)).toEqual({ c1: ["Alice"] });
  });

  it("applies the same filter as the counts", () => {
    const loans = [
      stubLoan({ role: "lender" }),
      stubLoan({ acknowledgedAt: null }),
      stubLoan({ status: "returned" }),
      stubLoan({ quantity: 2, returnedQuantity: 2 }),
    ];
    expect(aggregateBorrowedLendersByCard(loans)).toEqual({});
  });

  it("falls back to the placeholder for a deleted member", () => {
    const loans = [stubLoan({ counterparty: null, counterpartyName: null })];
    expect(aggregateBorrowedLendersByCard(loans)).toEqual({ c1: ["Former member"] });
  });
});
