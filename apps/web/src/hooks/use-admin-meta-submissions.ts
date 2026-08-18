import type { MetaSubmissionReason } from "@openrift/shared";
import type {
  AdminMetaSubmission,
  MetaSubmissionResolution,
} from "@openrift/shared/contracts/admin/meta-submissions";
import { adminMetaSubmissionsContract } from "@openrift/shared/contracts/admin/meta-submissions";
import { isDefinedError, safe } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// The admin half of meta decklist submissions (ADR-014's User submissions).
// Accepting a submission is the accept path's job — it writes the archived deck
// and the contributor's credit in one go — so everything here is the other
// outcome: the ledger row an admin stamps by hand, which is the only thing a
// declined contributor ever hears back.

/**
 * Resolving changes no live archive row, so only the queue and this row go
 * stale — the archived decks and the public pages are untouched by an outcome.
 *
 * @param candidateDeckId - The roster row the write came from.
 * @returns The query keys to invalidate.
 */
function submissionKeys(candidateDeckId: string) {
  return [
    queryKeys.admin.meta.submissionForDeck(candidateDeckId),
    queryKeys.admin.meta.candidates,
  ] as const;
}

const fetchSubmissionForCandidateDeck = createServerFn({ method: "GET" })
  .validator((input: { candidateDeckId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ submission: AdminMetaSubmission | null }> =>
    apiOrpcClient(adminMetaSubmissionsContract, context.cookie).forCandidateDeck({
      candidateDeckId: data.candidateDeckId,
    }),
  );

/**
 * The ledger row behind one candidate deck, or null when that deck is a
 * provider's rather than a person's.
 *
 * Null is the answer, not an error: the roster asks this about every deck it
 * opens, and most of them are scraped. The null is what decides whether a
 * resolve control renders at all — the candidate deck's own `submittedByUserId`
 * is a hint, but it goes null if the contributor deletes their account, and a
 * submission that outlives its submitter still needs resolving.
 *
 * @param candidateDeckId - The candidate deck being reviewed.
 * @returns The query holding the submission, or null when there is none.
 */
export function useMetaSubmissionForCandidateDeck(candidateDeckId: string) {
  return useQuery({
    queryKey: queryKeys.admin.meta.submissionForDeck(candidateDeckId),
    queryFn: () => fetchSubmissionForCandidateDeck({ data: { candidateDeckId } }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * What a resolve or reopen did. `alreadyAccepted` is a return value rather than
 * a thrown error for the same reason the multi-source overwrite refusal is: it
 * is an explanation the admin needs in front of the form — the accept already
 * settled this submission alongside a public credit and a live deck — and not a
 * failure to report in the global toast.
 */
export type MetaSubmissionWriteResult = { status: "ok" } | { status: "alreadyAccepted" };

/** One hand-stamped outcome, with whatever the contributor gets told about it. */
export interface ResolveMetaSubmissionInput {
  submissionId: string;
  /** Scopes the cache invalidation to the roster row this was resolved from. */
  candidateDeckId: string;
  status: MetaSubmissionResolution;
  /** The canned reason. Null leaves it unsaid. */
  reason: MetaSubmissionReason | null;
  /** The reviewer's own words, which replace the canned sentence when present. */
  note: string | null;
}

const resolveMetaSubmissionFn = createServerFn({ method: "POST" })
  .validator((input: Omit<ResolveMetaSubmissionInput, "candidateDeckId">) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaSubmissionWriteResult> => {
    const { error } = await safe(
      apiOrpcClient(adminMetaSubmissionsContract, context.cookie).resolve({
        id: data.submissionId,
        status: data.status,
        reason: data.reason,
        note: data.note,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "CONFLICT") {
        return { status: "alreadyAccepted" };
      }
      throw error;
    }
    return { status: "ok" };
  });

/**
 * Stamps a submission's outcome and the message its contributor reads.
 *
 * @returns The mutation; resolves with `alreadyAccepted` when the accept got
 *   there first, which the dialog explains rather than reporting as a failure.
 */
export function useResolveMetaSubmission() {
  return useMutationWithInvalidation<MetaSubmissionWriteResult, ResolveMetaSubmissionInput>({
    mutationFn: (vars) =>
      resolveMetaSubmissionFn({
        data: {
          submissionId: vars.submissionId,
          status: vars.status,
          reason: vars.reason,
          note: vars.note,
        },
      }),
    invalidates: (vars) => submissionKeys(vars.candidateDeckId),
  });
}

const reopenMetaSubmissionFn = createServerFn({ method: "POST" })
  .validator((input: { submissionId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<MetaSubmissionWriteResult> => {
    const { error } = await safe(
      apiOrpcClient(adminMetaSubmissionsContract, context.cookie).reopen({
        id: data.submissionId,
      }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "CONFLICT") {
        return { status: "alreadyAccepted" };
      }
      throw error;
    }
    return { status: "ok" };
  });

/**
 * Puts a resolved submission back to pending. Resolving leaves the staged
 * candidate deck in place, so this genuinely undoes a misclick rather than
 * apologising for a deleted decklist.
 *
 * @returns The mutation.
 */
export function useReopenMetaSubmission() {
  return useMutationWithInvalidation<
    MetaSubmissionWriteResult,
    { submissionId: string; candidateDeckId: string }
  >({
    mutationFn: (vars) => reopenMetaSubmissionFn({ data: { submissionId: vars.submissionId } }),
    invalidates: (vars) => submissionKeys(vars.candidateDeckId),
  });
}
