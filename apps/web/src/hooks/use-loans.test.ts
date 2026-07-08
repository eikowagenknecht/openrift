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

const { aggregateBorrowedCounts } = await import("./use-loans");

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
