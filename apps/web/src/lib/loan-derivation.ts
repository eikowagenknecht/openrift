import type { LoanResponse, LoanStatus } from "@openrift/shared/types/api/loan";

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

export function outstandingQuantity(loan: LoanResponse): number {
  return Math.max(0, loan.quantity - loan.returnedQuantity);
}

export function loanCounterpartyLabel(loan: LoanResponse): string {
  return loan.counterparty?.name ?? loan.counterpartyName ?? "Former member";
}

/** An empty `lenders` means the loans feed hasn't loaded yet, not that there are none. */
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

export type LoanSection = "attention" | "lent" | "borrowed" | "history";

/** A borrower's rejected loans are hidden entirely; they stay visible to the lender. */
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
