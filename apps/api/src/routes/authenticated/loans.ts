import type {
  LoanActionCountsResponse,
  LoanBorrowerOptionsResponse,
  LoanListResponse,
  LoanResponse,
} from "@openrift/shared";
import { loansContract } from "@openrift/shared/contracts/loans";
import { implement } from "@orpc/server";

import { toLoanResponse } from "../../lib/loan-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(loansContract).$context<ApiContext>().use(requireAuthedUser);

/** How many past free-text borrower names the lend dialog offers. */
const RECENT_BORROWER_NAMES_LIMIT = 8;

/**
 * Authenticated loans contract (mounted at `/api/v1/loans`, ADR-039). The loan
 * services throw `AppError` for state failures, which are mapped by the
 * handler's appErrorInterceptor.
 */
export const loansRouter = {
  create: os.create.handler(({ input, context }): Promise<LoanResponse> => {
    const { createLoan } = context.services;
    return createLoan(context.transact, {
      lenderUserId: context.userId,
      printingId: input.printingId,
      quantity: input.quantity,
      borrowerUserId: input.borrowerUserId,
      borrowerName: input.borrowerName,
      contextCollectionId: input.contextCollectionId,
    });
  }),

  list: os.list.handler(async ({ context }): Promise<LoanListResponse> => {
    const { loans } = context.repos;
    const rows = await loans.listDtoRowsForUser(context.userId);
    return { items: rows.map((row) => toLoanResponse(row, context.userId)) };
  }),

  actionCounts: os.actionCounts.handler(async ({ context }): Promise<LoanActionCountsResponse> => {
    const { loans } = context.repos;
    const total = await loans.acknowledgeNeededCountForUser(context.userId);
    return { total };
  }),

  borrowerOptions: os.borrowerOptions.handler(
    async ({ context }): Promise<LoanBorrowerOptionsResponse> => {
      const { loans } = context.repos;
      const [members, recentNames] = await Promise.all([
        loans.coMembersForUser(context.userId),
        loans.recentBorrowerNames(context.userId, RECENT_BORROWER_NAMES_LIMIT),
      ]);
      return { members, recentNames };
    },
  ),

  acknowledge: os.acknowledge.handler(({ input, context }): Promise<LoanResponse> => {
    const { acknowledgeLoan } = context.services;
    return acknowledgeLoan(context.transact, input.id, context.userId);
  }),

  reject: os.reject.handler(({ input, context }): Promise<LoanResponse> => {
    const { rejectLoan } = context.services;
    return rejectLoan(context.transact, input.id, context.userId);
  }),

  returnCopies: os.returnCopies.handler(({ input, context }): Promise<LoanResponse> => {
    const { returnLoanCopies } = context.services;
    return returnLoanCopies(context.transact, input.id, context.userId, input.quantity);
  }),

  writeOff: os.writeOff.handler(({ input, context }): Promise<LoanResponse> => {
    const { writeOffLoan } = context.services;
    return writeOffLoan(context.transact, input.id, context.userId, input.removeCopies);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<{ deleted: boolean }> => {
    const { deleteLoan } = context.services;
    await deleteLoan(context.transact, input.id, context.userId);
    return { deleted: true };
  }),
};
