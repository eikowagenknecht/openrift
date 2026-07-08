import type { LoanResponse, LoanStatus } from "@openrift/shared";

/**
 * Plain label for a loan status (ADR-039).
 * @returns The user-facing status label.
 */
export function loanStatusLabel(status: LoanStatus): string {
  switch (status) {
    case "active": {
      return "Active";
    }
    case "returned": {
      return "Returned";
    }
    case "written_off": {
      return "Written off";
    }
  }
}

/**
 * Copies still physically out on a loan.
 * @returns `quantity - returnedQuantity`, never negative.
 */
export function outstandingQuantity(loan: LoanResponse): number {
  return Math.max(0, loan.quantity - loan.returnedQuantity);
}

/**
 * Display name for the other party of a loan: the member's name, the free-text
 * borrower name, or a placeholder for a member who deleted their account.
 * @returns The counterparty label.
 */
export function loanCounterpartyLabel(loan: LoanResponse): string {
  return loan.counterparty?.name ?? loan.counterpartyName ?? "Former member";
}

/** The Loans-page bucket a loan renders in. */
export type LoanSection = "attention" | "lent" | "borrowed" | "history";

/**
 * Buckets a loan for the Loans page (ADR-039): closed loans are history;
 * an unconfirmed borrowed loan or a rejected lent loan needs attention;
 * everything else splits by role. A borrower's rejected loans are hidden
 * entirely (they disowned it; it stays visible to the lender).
 * @returns The section, or `null` when the loan is hidden from the viewer.
 */
export function loanSection(loan: LoanResponse): LoanSection | null {
  if (loan.status !== "active") {
    return "history";
  }
  if (loan.role === "borrower") {
    if (loan.rejectedAt !== null) {
      return null;
    }
    return loan.actionNeeded === "acknowledge" ? "attention" : "borrowed";
  }
  return loan.rejectedAt === null ? "lent" : "attention";
}
