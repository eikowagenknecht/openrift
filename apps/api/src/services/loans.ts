import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { LoanResponse } from "@openrift/shared/types/api/loan";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { toLoanResponse } from "../lib/loan-presenters.js";
import { isUniqueViolation } from "../lib/pg-errors.js";
import { disposeCopiesInTransaction } from "./copies.js";

export interface CreateLoanInput {
  lenderUserId: string;
  printingId: string;
  quantity: number;
  borrowerUserId?: string;
  borrowerName?: string;
  contextCollectionId?: string;
}

function tooFewAvailable(count: number): AppError {
  const noun = count === 1 ? "copy is" : "copies are";
  return new AppError(409, ERROR_CODES.CONFLICT, `Only ${count} ${noun} still available`);
}

async function reloadDto(repos: Repos, loanId: string, userId: string): Promise<LoanResponse> {
  const row = await repos.loans.getDtoRowByIdForUser(loanId, userId);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
  }
  return toLoanResponse(row, userId);
}

async function requireLenderLoan(repos: Repos, loanId: string, userId: string) {
  const loan = await repos.loans.getById(loanId);
  if (loan === undefined || loan.lenderUserId !== userId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
  }
  return loan;
}

export function createLoan(transact: Transact, input: CreateLoanInput): Promise<LoanResponse> {
  const { lenderUserId, printingId, quantity, borrowerUserId, borrowerName, contextCollectionId } =
    input;

  return transact(async (trxRepos) => {
    // Must throw inside the promise, not synchronously: tests and future
    // in-process callers expect a rejection here.
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

    // Locking before pinning serializes against a concurrent dispose of one
    // of these copies; survivors are the ids that still exist under the lock.
    const surviving = new Set(await trxRepos.copies.lockByIds(unclaimed));
    const lockedCopyIds = unclaimed.filter((id) => surviving.has(id));
    if (lockedCopyIds.length < quantity) {
      throw tooFewAvailable(lockedCopyIds.length);
    }

    // A concurrent acceptTrade can reserve one of these copy ids in the gap
    // between listUnclaimedCopyIds and the lock above; re-check now they're locked.
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
      // UNIQUE(copy_id) on loan_copies: a concurrent loan pinned one of these
      // copies first. At least one was lost, so report one fewer than we had.
      if (isUniqueViolation(error)) {
        throw tooFewAvailable(Math.max(0, availableCopyIds.length - 1));
      }
      throw error;
    }

    return reloadDto(trxRepos, loan.id, lenderUserId);
  });
}

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
