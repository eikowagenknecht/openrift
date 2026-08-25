import type { LoanCounterparty, LoanResponse, LoanRole, LoanStatus } from "@openrift/shared/types";

import { gravatarHashForEmail } from "./gravatar.js";

/**
 * A loan as the DTO query reads it. Loans are personal records (no group), so
 * unlike trades there is no group column and no contact methods.
 */
export interface LoanDtoRow {
  id: string;
  lenderUserId: string;
  borrowerUserId: string | null;
  borrowerName: string | null;
  printingId: string;
  cardId: string;
  quantity: number;
  returnedQuantity: number;
  status: LoanStatus;
  acknowledgedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  lenderName: string | null;
  lenderImage: string | null;
  lenderEmail: string;
  borrowerUserName: string | null;
  borrowerUserImage: string | null;
  borrowerUserEmail: string | null;
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * Orients a loan row to the viewer. The lender sees the borrower (a user, a
 * free-text name, or neither after the borrower deleted their account); a
 * member borrower always sees the lender.
 */
export function toLoanResponse(row: LoanDtoRow, userId: string): LoanResponse {
  const role: LoanRole = row.lenderUserId === userId ? "lender" : "borrower";

  let counterparty: LoanCounterparty | null = null;
  if (role === "borrower") {
    counterparty = {
      userId: row.lenderUserId,
      name: row.lenderName,
      image: row.lenderImage,
      gravatarHash: gravatarHashForEmail(row.lenderEmail),
    };
  } else if (row.borrowerUserId !== null) {
    counterparty = {
      userId: row.borrowerUserId,
      name: row.borrowerUserName,
      image: row.borrowerUserImage,
      // Non-null join match by FK; fall back defensively for the SET NULL race.
      gravatarHash: gravatarHashForEmail(row.borrowerUserEmail ?? ""),
    };
  }

  const needsAcknowledge =
    role === "borrower" &&
    row.status === "active" &&
    row.acknowledgedAt === null &&
    row.rejectedAt === null;

  return {
    id: row.id,
    role,
    counterparty,
    counterpartyName: role === "lender" ? row.borrowerName : null,
    printingId: row.printingId,
    cardId: row.cardId,
    quantity: row.quantity,
    returnedQuantity: row.returnedQuantity,
    status: row.status,
    acknowledgedAt: isoOrNull(row.acknowledgedAt),
    rejectedAt: isoOrNull(row.rejectedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: isoOrNull(row.closedAt),
    actionNeeded: needsAcknowledge ? "acknowledge" : null,
  };
}
