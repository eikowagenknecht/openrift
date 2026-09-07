import type { LoanResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  borrowedReasonText,
  loanCounterpartyLabel,
  loanSection,
  loanStatusLabel,
  outstandingQuantity,
} from "./loan-derivation";

function stubLoan(overrides: Partial<LoanResponse> = {}): LoanResponse {
  return {
    id: "loan-1",
    role: "lender",
    counterparty: null,
    counterpartyName: "Bob",
    printingId: "p1",
    cardId: "c1",
    quantity: 2,
    returnedQuantity: 0,
    status: "active",
    acknowledgedAt: null,
    rejectedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    closedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

describe("loanStatusLabel", () => {
  it("labels every status", () => {
    expect(loanStatusLabel("active")).toBe("Active");
    expect(loanStatusLabel("returned")).toBe("Returned");
    expect(loanStatusLabel("written_off")).toBe("Written off");
  });
});

describe("outstandingQuantity", () => {
  it("subtracts returned copies", () => {
    expect(outstandingQuantity(stubLoan({ quantity: 3, returnedQuantity: 1 }))).toBe(2);
  });

  it("never goes negative", () => {
    expect(outstandingQuantity(stubLoan({ quantity: 1, returnedQuantity: 2 }))).toBe(0);
  });
});

describe("loanCounterpartyLabel", () => {
  it("prefers the member name", () => {
    const loan = stubLoan({
      counterparty: { userId: "u1", name: "Marcus", image: null, gravatarHash: "gh" },
      counterpartyName: null,
    });
    expect(loanCounterpartyLabel(loan)).toBe("Marcus");
  });

  it("falls back to the free-text name", () => {
    expect(loanCounterpartyLabel(stubLoan({ counterpartyName: "Bob" }))).toBe("Bob");
  });

  it("labels a departed member borrower", () => {
    expect(loanCounterpartyLabel(stubLoan({ counterpartyName: null }))).toBe("Former member");
  });
});

describe("loanSection", () => {
  it("closes into history for both roles", () => {
    expect(loanSection(stubLoan({ status: "returned" }))).toBe("history");
    expect(loanSection(stubLoan({ role: "borrower", status: "written_off" }))).toBe("history");
  });

  it("puts an unconfirmed borrowed loan into attention", () => {
    expect(loanSection(stubLoan({ role: "borrower", actionNeeded: "acknowledge" }))).toBe(
      "attention",
    );
  });

  it("puts an acknowledged borrowed loan into borrowed", () => {
    expect(
      loanSection(stubLoan({ role: "borrower", acknowledgedAt: "2026-07-02T00:00:00Z" })),
    ).toBe("borrowed");
  });

  it("hides a borrowed loan the borrower rejected", () => {
    expect(
      loanSection(stubLoan({ role: "borrower", rejectedAt: "2026-07-02T00:00:00Z" })),
    ).toBeNull();
  });

  it("puts a rejected lent loan into attention for the lender", () => {
    expect(loanSection(stubLoan({ rejectedAt: "2026-07-02T00:00:00Z" }))).toBe("attention");
  });

  it("puts an ordinary active lent loan into lent", () => {
    expect(loanSection(stubLoan())).toBe("lent");
  });
});

describe("borrowedReasonText", () => {
  it("names a single lender", () => {
    expect(borrowedReasonText(1, ["Alice"])).toBe("1 copy is borrowed from Alice");
    expect(borrowedReasonText(3, ["Alice"])).toBe("3 copies are borrowed from Alice");
  });

  it("lists several lenders", () => {
    expect(borrowedReasonText(2, ["Alice", "Bob"])).toBe(
      "2 copies are borrowed from Alice and Bob",
    );
    expect(borrowedReasonText(3, ["Alice", "Bob", "Cait"])).toBe(
      "3 copies are borrowed from Alice, Bob and Cait",
    );
  });

  it("falls back to an unnamed friend when no lender is known yet", () => {
    expect(borrowedReasonText(1, [])).toBe("1 copy is borrowed from a friend");
    expect(borrowedReasonText(2, [])).toBe("2 copies are borrowed from a friend");
  });
});
