import type { JobRunStartedResponse } from "@openrift/shared";
import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

export const MATVIEWS_REFRESH_KIND = "matviews.refresh";

const refreshMatviewsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).refreshMatviews(),
  );

/**
 * The refresh can exceed the API's request timeout; the endpoint answers 202
 * with a run handle to poll via job-runs (`MATVIEWS_REFRESH_KIND`).
 */
export function useRefreshMatviews() {
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> => refreshMatviewsFn(),
  });
}
