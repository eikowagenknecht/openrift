import { ERROR_CODES } from "@openrift/shared";
import type { LoanResponse } from "@openrift/shared/types";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { isUniqueViolation } from "../lib/pg-errors.js";
import { disposeCopiesInTransaction } from "./copies.js";

export interface CreateLoanInput {
  lenderUserId: string;
  printingId: string;
  quantity: number;
  borrowerUserId?: string;
  borrowerName?: string;
  /** Biases automatic copy selection toward this collection. */
  contextCollectionId?: string;
}

function tooFewAvailable(count: number): AppError {
  const noun = count === 1 ? "copy is" : "copies are";
  return new AppError(409, ERROR_CODES.CONFLICT, `Only ${count} ${noun} still available`);
}

async function reloadDto(repos: Repos, loanId: string, userId: string): Promise<LoanResponse> {
  const dto = await repos.loans.getDtoByIdForUser(loanId, userId);
  if (dto === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
  }
  return dto;
}

/**
 * Loads a loan and verifies the caller is its lender. Non-parties and
 * borrowers get the same 404 (a loan's management surface is lender-only).
 */
async function requireLenderLoan(repos: Repos, loanId: string, userId: string) {
  const loan = await repos.loans.getById(loanId);
  if (loan === undefined || loan.lenderUserId !== userId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
  }
  return loan;
}

/**
 * Records a loan: active immediately, copies pinned in place. The borrower is
 * a friend-group co-member (who may later acknowledge/reject) or a free-text
 * name. Copies are auto-selected from the lender's personal collections,
 * context collection first, skipping every copy already claimed by a trade
 * reservation or another loan.
 */
export function createLoan(transact: Transact, input: CreateLoanInput): Promise<LoanResponse> {
  const { lenderUserId, printingId, quantity, borrowerUserId, borrowerName, contextCollectionId } =
    input;

  return transact(async (trxRepos) => {
    // The contract's refine already enforces this shape; re-check inside the
    // promise (never a synchronous throw — callers expect a rejection) because
    // the service is also called from tests and future in-process callers.
    if ((borrowerUserId === undefined) === (borrowerName === undefined)) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Set exactly one of borrowerUserId or borrowerName",
      );
    }
    if (borrowerUserId === lenderUserId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "You cannot lend to yourself");
    }
    if (borrowerUserId !== undefined) {
      const shared = await trxRepos.loans.isCoMember(lenderUserId, borrowerUserId);
      if (!shared) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Borrower not found in your groups");
      }
    }

    const cardId = await trxRepos.loans.printingCardId(printingId);
    if (cardId === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing not found");
    }

    const unclaimed = await trxRepos.loans.listUnclaimedCopyIds(
      lenderUserId,
      printingId,
      contextCollectionId,
    );
    if (unclaimed.length < quantity) {
      throw tooFewAvailable(unclaimed.length);
    }

    // Lock the candidate copies before pinning so a concurrent dispose of one
    // of them serializes against this loan; the survivors are the ids that
    // still exist under the lock.
    const surviving = new Set(await trxRepos.copies.lockByIds(unclaimed));
    const lockedCopyIds = unclaimed.filter((id) => surviving.has(id));
    if (lockedCopyIds.length < quantity) {
      throw tooFewAvailable(lockedCopyIds.length);
    }

    // `listUnclaimedCopyIds` excluded reserved copies before the lock, but a
    // concurrent acceptTrade can reserve one of these ids in the gap between that
    // read and the lock above — the unclaimed check and the trade reservation
    // live in separate tables, so `copies.lockByIds` alone can't catch it (the
    // pinCopies unique-violation catch below only guards against another loan).
    // Re-check the trade side now that the rows are locked.
    const reservedByTrade = new Set(await trxRepos.cardTrades.filterReservedCopyIds(lockedCopyIds));
    const availableCopyIds = lockedCopyIds.filter((id) => !reservedByTrade.has(id));
    if (availableCopyIds.length < quantity) {
      throw tooFewAvailable(availableCopyIds.length);
    }

    const loan = await trxRepos.loans.create({
      lenderUserId,
      borrowerUserId: borrowerUserId ?? null,
      borrowerName: borrowerName ?? null,
      printingId,
      cardId,
      quantity,
    });
    try {
      await trxRepos.loans.pinCopies(loan.id, availableCopyIds.slice(0, quantity));
    } catch (error) {
      // A concurrent loan pinned one of these copies between our unclaimed read
      // and this insert (UNIQUE(copy_id) on loan_copies). Surface it as "too few
      // available" — the same 409 acceptTrade returns — instead of a raw 500. At
      // least one of the picked copies was lost, so report one fewer than we
      // thought we had.
      if (isUniqueViolation(error)) {
        throw tooFewAvailable(Math.max(0, availableCopyIds.length - 1));
      }
      throw error;
    }

    return reloadDto(trxRepos, loan.id, lenderUserId);
  });
}

/**
 * Marks `count` copies as physically returned (lender only, partial returns
 * allowed). Releases that many pins; the loan closes as `returned` once
 * everything is back.
 */
export function returnLoanCopies(
  transact: Transact,
  loanId: string,
  userId: string,
  count: number,
): Promise<LoanResponse> {
  return transact(async (trxRepos) => {
    const loan = await requireLenderLoan(trxRepos, loanId, userId);

    const outstanding = loan.quantity - loan.returnedQuantity;
    if (count > outstanding) {
      const noun = outstanding === 1 ? "copy is" : "copies are";
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Only ${outstanding} ${noun} still out on this loan`,
      );
    }

    const updated = await trxRepos.loans.recordReturn(loanId, userId, count);
    if (updated === 0) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Loan state has changed");
    }
    await trxRepos.loans.releasePins(loanId, count);

    return reloadDto(trxRepos, loanId, userId);
  });
}

/**
 * Closes an active loan whose outstanding copies are never coming back
 * (lender only — covers both "keeping it by agreement" and a vanished
 * borrower). Releases the pins; with `removeCopies` the outstanding copies
 * are disposed from the lender's collection in the same transaction (the
 * apply side of the write-off proposal), without it they reappear as
 * available until fixed manually (the skip side). The borrower gets nothing.
 */
export function writeOffLoan(
  transact: Transact,
  loanId: string,
  userId: string,
  removeCopies: boolean,
): Promise<LoanResponse> {
  return transact(async (trxRepos) => {
    await requireLenderLoan(trxRepos, loanId, userId);

    const updated = await trxRepos.loans.markWrittenOff(loanId, userId);
    if (updated === 0) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Loan state has changed");
    }

    const pinned = await trxRepos.loans.listPinnedCopyIds(loanId);
    await trxRepos.loans.deletePinsForLoan(loanId);
    if (removeCopies && pinned.length > 0) {
      // Pins are already released, so the loan guard passes; a lent copy can
      // never be trade-reserved, so the reservation guard passes too.
      await disposeCopiesInTransaction(trxRepos, userId, pinned);
    }

    return reloadDto(trxRepos, loanId, userId);
  });
}

/**
 * The borrower confirms they hold the copies. Unlocks their borrowed surfaces
 * (Borrowed view, deck-builder counts).
 */
export function acknowledgeLoan(
  transact: Transact,
  loanId: string,
  userId: string,
): Promise<LoanResponse> {
  return transact(async (trxRepos) => {
    const updated = await trxRepos.loans.acknowledge(loanId, userId);
    if (updated === 0) {
      const loan = await trxRepos.loans.getById(loanId);
      if (loan === undefined || loan.borrowerUserId !== userId) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
      }
      throw new AppError(409, ERROR_CODES.CONFLICT, "Loan is not active");
    }
    return reloadDto(trxRepos, loanId, userId);
  });
}

/**
 * The borrower disputes the loan ("I don't have this"). The loan stays active
 * on the lender's side — rejection flags it back to them and hides it from the
 * borrower's surfaces.
 */
export function rejectLoan(
  transact: Transact,
  loanId: string,
  userId: string,
): Promise<LoanResponse> {
  return transact(async (trxRepos) => {
    const updated = await trxRepos.loans.reject(loanId, userId);
    if (updated === 0) {
      const loan = await trxRepos.loans.getById(loanId);
      if (loan === undefined || loan.borrowerUserId !== userId) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
      }
      throw new AppError(409, ERROR_CODES.CONFLICT, "Loan is not active");
    }
    return reloadDto(trxRepos, loanId, userId);
  });
}

/**
 * Deletes a loan outright (lender only, any status): mis-entries and unwanted
 * history. Pins cascade, so an active loan's copies become available again.
 */
export async function deleteLoan(
  transact: Transact,
  loanId: string,
  userId: string,
): Promise<void> {
  await transact(async (trxRepos) => {
    const deleted = await trxRepos.loans.deleteByIdForLender(loanId, userId);
    if (deleted === 0) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
    }
  });
}
