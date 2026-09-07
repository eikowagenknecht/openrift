import type { JobRunStartedResponse } from "@openrift/shared";
import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

export const CARD_TOKENS_RECOMPUTE_KIND = "card_tokens.recompute";

const recomputeCardTokensFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).recomputeCardTokens(),
  );

/**
 * The full pass can exceed the API's request timeout; the endpoint answers
 * 202 with a run handle to poll via job-runs (`CARD_TOKENS_RECOMPUTE_KIND`).
 */
export function useRecomputeCardTokens() {
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> => recomputeCardTokensFn(),
  });
}
