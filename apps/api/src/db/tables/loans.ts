import type { LoanStatus } from "@openrift/shared/types/api/loan";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface LoansTable {
  id: Generated<string>;
  lenderUserId: string;
  borrowerUserId: string | null;
  borrowerName: string | null;
  printingId: string;
  cardId: string;
  quantity: number;
  returnedQuantity: Generated<number>;
  status: Generated<LoanStatus>;
  acknowledgedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  closedAt: Date | null;
}

export interface LoanCopiesTable {
  loanId: string;
  copyId: string;
}
