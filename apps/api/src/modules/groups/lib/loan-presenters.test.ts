import { describe, expect, it } from "vitest";

import { gravatarHashForEmail } from "../../../lib/gravatar.js";
import type { LoanDtoRow } from "../repositories/loans.js";
import { toLoanResponse } from "./loan-presenters.js";

const LENDER_ID = "user-lender";
const BORROWER_ID = "user-borrower";

function loanRow(overrides: Partial<LoanDtoRow> = {}): LoanDtoRow {
  return {
    id: "loan-1",
    lenderUserId: LENDER_ID,
    borrowerUserId: BORROWER_ID,
    borrowerName: null,
    printingId: "printing-a",
    cardId: "OGS-001",
    quantity: 3,
    returnedQuantity: 0,
    status: "active",
    acknowledgedAt: null,
    rejectedAt: null,
    createdAt: new Date("2026-03-17T10:00:00.000Z"),
    updatedAt: new Date("2026-03-18T11:30:00.000Z"),
    closedAt: null,
    lenderName: "Ekko",
    lenderImage: "https://cdn.example/ekko.png",
    lenderEmail: " Ekko@Example.COM ",
    borrowerUserName: "Jinx",
    borrowerUserImage: null,
    borrowerUserEmail: "jinx@example.com",
    ...overrides,
  };
}

describe("toLoanResponse", () => {
  it("shows the lender the borrower", () => {
    const result = toLoanResponse(loanRow(), LENDER_ID);
    expect(result.role).toBe("lender");
    expect(result.counterparty).toEqual({
      userId: BORROWER_ID,
      name: "Jinx",
      image: null,
      gravatarHash: gravatarHashForEmail("jinx@example.com"),
    });
    expect(result.counterpartyName).toBeNull();
  });

  it("shows the borrower the lender, with the normalised email hashed", () => {
    const result = toLoanResponse(loanRow(), BORROWER_ID);
    expect(result.role).toBe("borrower");
    expect(result.counterparty).toEqual({
      userId: LENDER_ID,
      name: "Ekko",
      image: "https://cdn.example/ekko.png",
      gravatarHash: gravatarHashForEmail("ekko@example.com"),
    });
  });

  it("gives the lender a bare name for a borrower who is off the app or departed", () => {
    const row = loanRow({
      borrowerUserId: null,
      borrowerName: "Partial Pat",
      borrowerUserName: null,
      borrowerUserImage: null,
      borrowerUserEmail: null,
    });
    const result = toLoanResponse(row, LENDER_ID);
    expect(result.counterparty).toBeNull();
    expect(result.counterpartyName).toBe("Partial Pat");
  });

  it("asks an unanswered member borrower to acknowledge", () => {
    expect(toLoanResponse(loanRow(), BORROWER_ID).actionNeeded).toBe("acknowledge");
  });

  it("asks nothing of the lender", () => {
    expect(toLoanResponse(loanRow(), LENDER_ID).actionNeeded).toBeNull();
  });

  it("asks nothing of a borrower who already answered", () => {
    const acknowledged = loanRow({ acknowledgedAt: new Date("2026-03-19T10:00:00.000Z") });
    expect(toLoanResponse(acknowledged, BORROWER_ID).actionNeeded).toBeNull();

    const rejected = loanRow({ rejectedAt: new Date("2026-03-19T10:00:00.000Z") });
    expect(toLoanResponse(rejected, BORROWER_ID).actionNeeded).toBeNull();
  });

  it("asks nothing of a borrower once the loan is closed", () => {
    for (const status of ["returned", "written_off"] as const) {
      const row = loanRow({ status, closedAt: new Date("2026-03-20T10:00:00.000Z") });
      expect(toLoanResponse(row, BORROWER_ID).actionNeeded).toBeNull();
    }
  });

  it("converts every timestamp to ISO, keeping the unset ones null", () => {
    const row = loanRow({
      acknowledgedAt: new Date("2026-03-19T10:00:00.000Z"),
      closedAt: new Date("2026-03-20T10:00:00.000Z"),
    });
    const result = toLoanResponse(row, BORROWER_ID);
    expect(result.createdAt).toBe("2026-03-17T10:00:00.000Z");
    expect(result.updatedAt).toBe("2026-03-18T11:30:00.000Z");
    expect(result.acknowledgedAt).toBe("2026-03-19T10:00:00.000Z");
    expect(result.closedAt).toBe("2026-03-20T10:00:00.000Z");
    expect(result.rejectedAt).toBeNull();
  });
});
