import type { JobRunStartedResponse } from "@openrift/shared";
import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Job-runs kind written by the materialized-view refresh, for polling. */
export const MATVIEWS_REFRESH_KIND = "matviews.refresh";

const refreshMatviewsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobRunStartedResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).refreshMatviews(),
  );

/**
 * Kicks off a background refresh of the Postgres materialized views (latest
 * marketplace prices and card aggregates). Useful after manual price imports or
 * schema-affecting fixes when the cron-driven refresh hasn't run yet. The
 * refresh can take well over the API's request timeout, so the endpoint answers
 * 202 with a run handle; poll job-runs (`MATVIEWS_REFRESH_KIND`) for the
 * outcome.
 *
 * @returns A mutation that starts the materialized-view refresh job.
 */
export function useRefreshMatviews() {
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> => refreshMatviewsFn(),
  });
}
