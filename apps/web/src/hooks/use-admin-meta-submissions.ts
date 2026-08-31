import type {
  AdminMetaEventCorrection,
  AdminMetaSubmission,
} from "@openrift/shared/contracts/admin/meta-submissions";
import { adminMetaSubmissionsContract } from "@openrift/shared/contracts/admin/meta-submissions";
import { isDefinedError, safe } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
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
 * @param playerOverlayId - The standings overlay the write came from, or null
 *   for a correction to an event's facts, which stages no overlay.
 * @returns The query keys to invalidate.
 */
function submissionKeys(playerOverlayId: string | null) {
  if (playerOverlayId === null) {
    return [queryKeys.admin.meta.eventCorrections] as const;
  }
  return [
    queryKeys.admin.meta.submissionForPlayerOverlay(playerOverlayId),
    queryKeys.admin.meta.overlays,
  ] as const;
}

const fetchMetaEventCorrections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ items: AdminMetaEventCorrection[]; hasMore: boolean }> =>
    apiOrpcClient(adminMetaSubmissionsContract, context.cookie).eventCorrections(),
  );

/**
 * Every unresolved correction to an event's own facts, with the event beside it.
 *
 * These have no candidate row and no accept path — an admin reads the note,
 * edits the event themselves, and stamps the outcome — so they are listed on
 * their own rather than found through the roster.
 *
 * @returns The corrections query.
 */
export function useMetaEventCorrections() {
  return useQuery({
    queryKey: queryKeys.admin.meta.eventCorrections,
    queryFn: () => fetchMetaEventCorrections(),
    staleTime: 60 * 1000,
  });
}

const fetchSubmissionForPlayerOverlay = createServerFn({ method: "GET" })
  .validator((input: { playerOverlayId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ submission: AdminMetaSubmission | null }> =>
    apiOrpcClient(adminMetaSubmissionsContract, context.cookie).forPlayerOverlay({
      playerOverlayId: data.playerOverlayId,
    }),
  );

/**
 * The ledger row behind one standings overlay, or null when that overlay is a
 * provider's rather than a person's.
 *
 * Null is the answer, not an error: the queue asks this about every row it
 * renders, and most of them are scraped. The null is what decides whether a
 * resolve control renders at all — the overlay's own `submittedBy` is a hint,
 * but it goes null if the contributor deletes their account, and a submission
 * that outlives its submitter still needs resolving.
 *
 * @param playerOverlayId - The standings overlay being reviewed.
 * @param enabled - False for an overlay that cannot carry a submission, so a
 *   provider's queue row costs no request.
 * @returns The query holding the submission, or null when there is none.
 */
export function useMetaSubmissionForPlayerOverlay(playerOverlayId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.meta.submissionForPlayerOverlay(playerOverlayId),
    queryFn: () => fetchSubmissionForPlayerOverlay({ data: { playerOverlayId } }),
    enabled,
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
export type ResolveMetaSubmissionInput = Omit<
  ContractInput<typeof adminMetaSubmissionsContract, "resolve">,
  "id"
> & {
  submissionId: string;
  /**
   * Scopes the cache invalidation to the overlay this was resolved from. Null
   * for a correction to an event's facts, which stages no overlay.
   */
  playerOverlayId: string | null;
};

const resolveMetaSubmissionFn = createServerFn({ method: "POST" })
  .validator((input: Omit<ResolveMetaSubmissionInput, "playerOverlayId">) => input)
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
    invalidates: (vars) => submissionKeys(vars.playerOverlayId),
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
 * Puts a resolved submission back to pending. Resolving leaves the overlay in
 * place, so this genuinely undoes a misclick rather than apologising for a
 * deleted decklist.
 *
 * @returns The mutation.
 */
export function useReopenMetaSubmission() {
  return useMutationWithInvalidation<
    MetaSubmissionWriteResult,
    { submissionId: string; playerOverlayId: string | null }
  >({
    mutationFn: (vars) => reopenMetaSubmissionFn({ data: { submissionId: vars.submissionId } }),
    invalidates: (vars) => submissionKeys(vars.playerOverlayId),
  });
}
