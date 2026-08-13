import type { JobRunStartedResponse } from "@openrift/shared";
import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Job-runs kind written by the card-token re-derivation, for polling. */
export const CARD_TOKENS_RECOMPUTE_KIND = "card_tokens.recompute";

const recomputeCardTokensFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).recomputeCardTokens(),
  );

/**
 * Kicks off a background re-derivation of every card's token references from
 * EN rules text, followed by a card-aggregates view refresh. Card and errata
 * edits already do this for the card they touch, so this is for the initial
 * backfill and after a bulk set import. The full pass can take well over the
 * API's request timeout, so the endpoint answers 202 with a run handle; poll
 * job-runs (`CARD_TOKENS_RECOMPUTE_KIND`) for the outcome and counts.
 *
 * @returns A mutation that starts the full re-derivation job.
 */
export function useRecomputeCardTokens() {
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> => recomputeCardTokensFn(),
  });
}
