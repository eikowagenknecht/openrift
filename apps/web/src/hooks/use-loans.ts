import type { LoanResponse } from "@openrift/shared";
import { loansContract } from "@openrift/shared/contracts/loans";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { loanCounterpartyLabel } from "@/lib/loan-derivation";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ───────────────────────────────────────────────

const fetchLoans = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(loansContract, context.cookie).list());

const fetchLoanActionCounts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(loansContract, context.cookie).actionCounts());

const fetchBorrowerOptions = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(loansContract, context.cookie).borrowerOptions());

// ── Server functions: mutations ─────────────────────────────────────────────

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
    // acknowledge/reject share the same { id } → LoanResponse shape.
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

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Per-printing counts of copies the viewer is currently borrowing: their
 * acknowledged active borrower-role loans, outstanding quantities summed.
 * Unconfirmed and rejected loans deliberately don't count (ADR-039).
 * @returns Borrowed copy counts keyed by printingId.
 */
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

/**
 * Who the viewer is borrowing each card from, keyed by cardId rather than
 * printing: a deck row is a card, and it doesn't care that two of its copies
 * came from different printings. Same filter as
 * {@link aggregateBorrowedCounts}. Names are deduped and kept in loan order,
 * so the tooltip lists a lender once however many loans they hold.
 * @returns Lender display names keyed by cardId.
 */
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
    const names = (lenders[loan.cardId] ??= []);
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return lenders;
}

// ── Query hooks ─────────────────────────────────────────────────────────────

/**
 * Query options for the viewer's loans — shared by the hooks below and the
 * /loans route loader (SSR prefetch).
 * @returns The loans query options.
 */
export function loansQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.loans.all(userId),
    queryFn: () => fetchLoans(),
  });
}

/**
 * All loans the viewer is a party to (the Loans page).
 * @returns The loans query.
 */
export function useLoans() {
  const userId = useRequiredUserId();
  return useQuery(loansQueryOptions(userId));
}

/**
 * Polled "loans awaiting your acknowledgment" count for the nav badge. A plain
 * (non-suspense) query so it can live in the header without an authenticated
 * route boundary.
 * @returns The action-counts query (`{ total }`).
 */
export function useLoanActionCounts() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.loans.actionCounts(userId ?? ""),
    queryFn: () => fetchLoanActionCounts(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: userId !== null,
  });
}

/**
 * Borrower-picker data for the lend dialog: co-members across the viewer's
 * groups plus their past free-text borrower names.
 * @returns The borrower-options query.
 */
export function useLoanBorrowerOptions(enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.loans.borrowerOptions(userId ?? ""),
    queryFn: () => fetchBorrowerOptions(),
    enabled: enabled && userId !== null,
  });
}

/**
 * Per-printing borrowed counts for the deck builder (ADR-039): acknowledged
 * active loans where the viewer is the borrower. Sourced from the loans API,
 * not the copies collection — borrowed copies are never phantom copy rows.
 * @returns Borrowed counts keyed by printingId, or undefined while loading/disabled.
 */
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

/**
 * Lender names per borrowed card, for the deck rows' borrow tooltip. Self-gates
 * on the session rather than taking an `enabled` flag: every call site is a
 * deck row deep inside the tree, where threading the flag down would be the
 * only thing the prop existed for.
 * @returns Lender names keyed by cardId, or undefined while loading/logged out.
 */
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

// ── Mutation hooks ──────────────────────────────────────────────────────────

/**
 * Loan mutations pin/release copies, which changes the `onLoan` flag on the
 * copies feed — so every loan mutation also resyncs the client-side copies
 * store (badges, deck-avail buckets). That takes both keys: `copies.all`
 * marks the shared response cache stale, and `copies.syncedStore` makes the
 * react-db collection's own query refetch through it (its queryFn only hits
 * the network when the shared cache is stale). The server picks which copies
 * get pinned or released, so there is nothing to write optimistically.
 * @returns The query keys to invalidate.
 */
function loanInvalidationKeys(userId: string): (readonly unknown[])[] {
  return [
    queryKeys.loans.all(userId),
    queryKeys.copies.all(userId),
    queryKeys.copies.syncedStore(userId),
  ];
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
