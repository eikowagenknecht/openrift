import { adminCardSubmissionsContract } from "@openrift/shared/contracts/admin/card-submissions";
import type { AdminCardSubmission } from "@openrift/shared/contracts/admin/card-submissions";
import type { CardSubmissionReason } from "@openrift/shared/contracts/card-submissions";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchSubmissionForCandidateFn = createServerFn({ method: "GET" })
  .validator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ submission: AdminCardSubmission | null }> =>
    apiOrpcClient(adminCardSubmissionsContract, context.cookie).forCandidate(data),
  );

/**
 * The submission behind a candidate column, or null for a scraped provider.
 * @param candidateCardId The candidate column being inspected.
 * @returns Query options for the admin submission lookup.
 */
export function submissionForCandidateQueryOptions(candidateCardId: string) {
  return queryOptions({
    queryKey: queryKeys.cardSubmissions.forCandidate(candidateCardId),
    queryFn: () => fetchSubmissionForCandidateFn({ data: { candidateCardId } }),
  });
}

/**
 * Loads the submission behind a candidate column. Only enabled once the caller
 * has a candidate to ask about, so an unopened dialog fetches nothing.
 * @param candidateCardId The candidate column, or null while the dialog is closed.
 * @returns The submission query.
 */
export function useSubmissionForCandidate(candidateCardId: string | null) {
  return useQuery({
    ...submissionForCandidateQueryOptions(candidateCardId ?? ""),
    enabled: candidateCardId !== null,
  });
}

const setSubmissionResolutionFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      candidateCardId: string;
      reason: CardSubmissionReason | null;
      note: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardSubmissionsContract, context.cookie).setResolution(data);
  });

/**
 * Writes the message a contributor sees for their submission. Independent of
 * the outcome itself, which the check and ignore verbs derive, so this can be
 * written before or after the submission settles.
 * @returns The resolution mutation.
 */
export function useSetSubmissionResolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      candidateCardId: string;
      reason: CardSubmissionReason | null;
      note: string | null;
    }) => setSubmissionResolutionFn({ data: params }),
    onSuccess: (_result, params) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cardSubmissions.forCandidate(params.candidateCardId),
      });
    },
  });
}
