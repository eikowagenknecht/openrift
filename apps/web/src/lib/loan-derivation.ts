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

/**
 * Tooltip sentence for a deck row's borrow glyph — the mirror of
 * `lockedReasonText`. Borrowed copies are in hand and count as buildable, so
 * without this the row says nothing at all about where they came from.
 * Lenders may be empty when the loans feed hasn't loaded yet, which reads as
 * the vaguer "from a friend" rather than an empty name.
 * @returns One sentence naming the borrowed copies and who they came from.
 */
export function borrowedReasonText(count: number, lenders: readonly string[]): string {
  const copies = count === 1 ? "1 copy is" : `${count} copies are`;
  if (lenders.length === 0) {
    return `${copies} borrowed from a friend`;
  }
  const names =
    lenders.length === 1
      ? lenders[0]
      : `${lenders.slice(0, -1).join(", ")} and ${lenders.at(-1) ?? ""}`;
  return `${copies} borrowed from ${names}`;
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
