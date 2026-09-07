import { CARD_TRADE_LIVE_PHASES } from "@openrift/shared/card-trade-lifecycle";
import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { LoanResponse } from "@openrift/shared/types/api/loan";
import type { LucideIcon } from "lucide-react";
import { HandCoinsIcon, HandHeartIcon } from "lucide-react";

import { loanCounterpartyLabel, outstandingQuantity } from "@/features/groups/lib/loan-derivation";
import { liveTradeStatus } from "@/features/groups/lib/trade-status-labels";

/** One sentence about copies of a card that are lent, borrowed, or in a live trade. */
export interface CardHoldingLine {
  key: string;
  icon: LucideIcon;
  text: string;
  tone: "soft" | "committed";
}

// HandHeartIcon means "lent out" on a collection tile and "borrowed" on a deck
// row. This is the first surface showing both, so the two must not share one.
const LENT_ICON = HandHeartIcon;
const BORROWED_ICON = HandCoinsIcon;

function copies(count: number): string {
  return count === 1 ? "1 copy" : `${count} copies`;
}

// Active with copies still out matches the `on_loan` copy pin: an
// unacknowledged loan has already taken the cards out of the binder.
function lentLines(loans: readonly LoanResponse[]): CardHoldingLine[] {
  const byBorrower = new Map<string, number>();
  for (const loan of loans) {
    if (loan.role !== "lender" || loan.status !== "active") {
      continue;
    }
    const outstanding = outstandingQuantity(loan);
    if (outstanding === 0) {
      continue;
    }
    const name = loanCounterpartyLabel(loan);
    byBorrower.set(name, (byBorrower.get(name) ?? 0) + outstanding);
  }
  return [...byBorrower].map(([name, count]) => ({
    key: `lent:${name}`,
    icon: LENT_ICON,
    text: `Lent ${copies(count)} to ${name}`,
    tone: "committed" as const,
  }));
}

// Unacknowledged and rejected loans are excluded, the same filter
// aggregateBorrowedCounts applies.
function borrowedLines(loans: readonly LoanResponse[]): CardHoldingLine[] {
  const byLender = new Map<string, number>();
  for (const loan of loans) {
    if (loan.role !== "borrower" || loan.status !== "active" || loan.acknowledgedAt === null) {
      continue;
    }
    const outstanding = outstandingQuantity(loan);
    if (outstanding === 0) {
      continue;
    }
    const name = loanCounterpartyLabel(loan);
    byLender.set(name, (byLender.get(name) ?? 0) + outstanding);
  }
  return [...byLender].map(([name, count]) => ({
    key: `borrowed:${name}`,
    icon: BORROWED_ICON,
    text: `Borrowed ${copies(count)} from ${name}`,
    tone: "committed" as const,
  }));
}

function tradeLines(annotations: readonly CardTradeLiveAnnotation[]): CardHoldingLine[] {
  const byBucket = new Map<string, number>();
  for (const annotation of annotations) {
    const key = `${annotation.role}:${annotation.phase}`;
    byBucket.set(key, (byBucket.get(key) ?? 0) + annotation.quantity);
  }
  const lines: CardHoldingLine[] = [];
  for (const role of ["giver", "receiver"] as const) {
    for (const phase of CARD_TRADE_LIVE_PHASES.toReversed()) {
      const count = byBucket.get(`${role}:${phase}`);
      if (count === undefined || count === 0) {
        continue;
      }
      const status = liveTradeStatus({ role, phase });
      lines.push({
        key: `trade:${role}:${phase}`,
        icon: status.icon,
        text: `${status.label} · ${copies(count)} ${status.direction}`,
        tone: status.tone,
      });
    }
  }
  return lines;
}

/**
 * The viewer's loans and live trades on `printingIds`, as display lines.
 * Trade lines carry no identity: the annotation endpoint returns none.
 */
export function cardHoldingLines({
  loans,
  annotations,
  printingIds,
}: {
  loans: readonly LoanResponse[];
  annotations: readonly CardTradeLiveAnnotation[];
  printingIds: readonly string[];
}): CardHoldingLine[] {
  const scope = new Set(printingIds);
  const scopedLoans = loans.filter((loan) => scope.has(loan.printingId));
  const scopedAnnotations = annotations.filter((entry) => scope.has(entry.printingId));
  return [
    ...lentLines(scopedLoans),
    ...borrowedLines(scopedLoans),
    ...tradeLines(scopedAnnotations),
  ];
}
