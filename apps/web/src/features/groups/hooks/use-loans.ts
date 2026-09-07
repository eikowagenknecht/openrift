import { loansContract } from "@openrift/shared/contracts/loans";
import type { LoanResponse } from "@openrift/shared/types/api/loan";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { copiesKeys } from "@/features/collections/lib/collections-query-keys";
import { loansKeys } from "@/features/groups/lib/groups-query-keys";
import { loanCounterpartyLabel } from "@/features/groups/lib/loan-derivation";
import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchLoans = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(loansContract, context.cookie).list());

const fetchLoanActionCounts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(loansContract, context.cookie).actionCounts());

const fetchBorrowerOptions = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(loansContract, context.cookie).borrowerOptions());

const createLoanFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      printingId: string;
      quantity: number;
      borrowerUserId?: string;
      borrowerName?: string;
      contextCollectionId?: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) => apiOrpcClient(loansContract, context.cookie).create(data));

const loanActionFn = createServerFn({ method: "POST" })
  .validator((input: { loanId: string; action: "acknowledge" | "reject" }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<LoanResponse> =>
    apiOrpcClient(loansContract, context.cookie)[data.action]({ id: data.loanId }),
  );

const returnLoanCopiesFn = createServerFn({ method: "POST" })
  .validator((input: { loanId: string; quantity: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(loansContract, context.cookie).returnCopies({
      id: data.loanId,
      quantity: data.quantity,
    }),
  );

const writeOffLoanFn = createServerFn({ method: "POST" })
  .validator((input: { loanId: string; removeCopies: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(loansContract, context.cookie).writeOff({
      id: data.loanId,
      removeCopies: data.removeCopies,
    }),
  );

const deleteLoanFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: loanId }) =>
    apiOrpcClient(loansContract, context.cookie).remove({ id: loanId }),
  );

/** Unconfirmed and rejected loans deliberately don't count toward borrowed totals. */
export function aggregateBorrowedCounts(loans: readonly LoanResponse[]): Record<string, number> {
  const borrowed: Record<string, number> = {};
  for (const loan of loans) {
    if (loan.role !== "borrower" || loan.status !== "active" || loan.acknowledgedAt === null) {
      continue;
    }
    const outstanding = loan.quantity - loan.returnedQuantity;
    if (outstanding > 0) {
      borrowed[loan.printingId] = (borrowed[loan.printingId] ?? 0) + outstanding;
    }
  }
  return borrowed;
}

export function aggregateBorrowedLendersByCard(
  loans: readonly LoanResponse[],
): Record<string, string[]> {
  const lenders: Record<string, string[]> = {};
  for (const loan of loans) {
    if (loan.role !== "borrower" || loan.status !== "active" || loan.acknowledgedAt === null) {
      continue;
    }
    if (loan.quantity - loan.returnedQuantity <= 0) {
      continue;
    }
    const name = loanCounterpartyLabel(loan);
    const names = lenders[loan.cardId] ?? [];
    lenders[loan.cardId] = names;
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return lenders;
}

export function loansQueryOptions(userId: string) {
  return queryOptions({
    queryKey: loansKeys.all(userId),
    queryFn: () => fetchLoans(),
  });
}

export function useLoans() {
  const userId = useRequiredUserId();
  return useQuery(loansQueryOptions(userId));
}

/** A plain, non-suspense query so this can live in the header outside an authenticated route boundary. */
export function useLoanActionCounts() {
  const userId = useUserId();
  return useQuery({
    queryKey: loansKeys.actionCounts(userId ?? ""),
    queryFn: () => fetchLoanActionCounts(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: userId !== null,
  });
}

export function useLoanBorrowerOptions(enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: loansKeys.borrowerOptions(userId ?? ""),
    queryFn: () => fetchBorrowerOptions(),
    enabled: enabled && userId !== null,
  });
}

/** Sourced from the loans API, not the copies collection: borrowed copies are never phantom copy rows. */
export function useBorrowedCounts(enabled: boolean): { data: Record<string, number> | undefined } {
  const userId = useUserId();
  const { data } = useQuery({
    ...loansQueryOptions(userId ?? ""),
    enabled: enabled && userId !== null,
  });
  if (!enabled || data === undefined) {
    return { data: undefined };
  }
  return { data: aggregateBorrowedCounts(data.items) };
}

export function useBorrowedLenders(): { data: Record<string, string[]> | undefined } {
  const userId = useUserId();
  const { data } = useQuery({
    ...loansQueryOptions(userId ?? ""),
    enabled: userId !== null,
  });
  if (data === undefined) {
    return { data: undefined };
  }
  return { data: aggregateBorrowedLendersByCard(data.items) };
}

/**
 * Loan mutations change the `onLoan` flag on the copies feed, so both
 * `copies.all` and `copies.syncedStore` need invalidating to resync the
 * client-side copies store.
 */
function loanInvalidationKeys(userId: string): (readonly unknown[])[] {
  return [loansKeys.all(userId), copiesKeys.all(userId), copiesKeys.syncedStore(userId)];
}

export function useCreateLoan() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    LoanResponse,
    {
      printingId: string;
      quantity: number;
      borrowerUserId?: string;
      borrowerName?: string;
      contextCollectionId?: string;
    }
  >({
    mutationFn: (data) => createLoanFn({ data }),
    invalidates: () => loanInvalidationKeys(userId),
  });
}

export function useAcknowledgeLoan() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<LoanResponse, { loanId: string }>({
    mutationFn: (data) => loanActionFn({ data: { loanId: data.loanId, action: "acknowledge" } }),
    invalidates: () => loanInvalidationKeys(userId),
  });
}

export function useRejectLoan() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<LoanResponse, { loanId: string }>({
    mutationFn: (data) => loanActionFn({ data: { loanId: data.loanId, action: "reject" } }),
    invalidates: () => loanInvalidationKeys(userId),
  });
}

export function useReturnLoanCopies() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<LoanResponse, { loanId: string; quantity: number }>({
    mutationFn: (data) => returnLoanCopiesFn({ data }),
    invalidates: () => loanInvalidationKeys(userId),
  });
}

export function useWriteOffLoan() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<LoanResponse, { loanId: string; removeCopies: boolean }>({
    mutationFn: (data) => writeOffLoanFn({ data }),
    invalidates: () => loanInvalidationKeys(userId),
  });
}

export function useDeleteLoan() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<{ deleted: boolean }, { loanId: string }>({
    mutationFn: (data) => deleteLoanFn({ data: data.loanId }),
    invalidates: () => loanInvalidationKeys(userId),
  });
}
