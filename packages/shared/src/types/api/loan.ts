// Card lending ledger DTOs (ADR-039). These are derived from the
// `loan*ResponseSchema` contract schemas in `contracts/loans.ts`.

import type {
  LOAN_STATUSES,
  loanActionCountsResponseSchema,
  loanBorrowerOptionsResponseSchema,
  loanCounterpartySchema,
  loanListResponseSchema,
  loanResponseSchema,
} from "@openrift/shared/contracts/loans";
import type { z } from "zod";

/** The viewer's side of a loan. */
export type LoanRole = "lender" | "borrower";

export type LoanStatus = (typeof LOAN_STATUSES)[number];

export type LoanCounterparty = z.infer<typeof loanCounterpartySchema>;

/**
 * One loan, oriented to the viewer. `role` is the viewer's side; the
 * counterparty fields describe the other party. Card name/image are resolved
 * client-side from the loaded catalog by `printingId`/`cardId`, exactly as
 * trades and copies do.
 */
export type LoanResponse = z.infer<typeof loanResponseSchema>;

export type LoanListResponse = z.infer<typeof loanListResponseSchema>;

/** Count of loans awaiting the viewer's acknowledgment as borrower. */
export type LoanActionCountsResponse = z.infer<typeof loanActionCountsResponseSchema>;

export type LoanBorrowerOptionsResponse = z.infer<typeof loanBorrowerOptionsResponseSchema>;
