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

function submissionForCandidateQueryOptions(candidateCardId: string) {
  return queryOptions({
    queryKey: queryKeys.cardSubmissions.forCandidate(candidateCardId),
    queryFn: () => fetchSubmissionForCandidateFn({ data: { candidateCardId } }),
  });
}

/** Enabled only once the caller has a candidate, so an unopened dialog fetches nothing. */
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
 * Independent of the outcome (the check/ignore verbs derive that); can be set
 * before or after the submission settles.
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
