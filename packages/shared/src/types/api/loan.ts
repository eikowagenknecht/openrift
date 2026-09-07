import type {
  LOAN_STATUSES,
  loanActionCountsResponseSchema,
  loanBorrowerOptionsResponseSchema,
  loanCounterpartySchema,
  loanListResponseSchema,
  loanResponseSchema,
} from "@openrift/shared/contracts/loans";
import type { z } from "zod";

export type LoanRole = "lender" | "borrower";

export type LoanStatus = (typeof LOAN_STATUSES)[number];

export type LoanCounterparty = z.infer<typeof loanCounterpartySchema>;

/** Card name/image are resolved client-side from the catalog by `printingId`/`cardId`. */
export type LoanResponse = z.infer<typeof loanResponseSchema>;

export type LoanListResponse = z.infer<typeof loanListResponseSchema>;

export type LoanActionCountsResponse = z.infer<typeof loanActionCountsResponseSchema>;

export type LoanBorrowerOptionsResponse = z.infer<typeof loanBorrowerOptionsResponseSchema>;
