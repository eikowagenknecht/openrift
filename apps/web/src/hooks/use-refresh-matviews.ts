import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const refreshMatviewsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await apiOrpcClient(adminOperationsContract, context.cookie).refreshMatviews();
  });

/**
 * Refreshes Postgres materialized views (latest marketplace prices and card
 * aggregates). Useful after manual price imports or schema-affecting fixes
 * when the cron-driven refresh hasn't run yet.
 *
 * @returns A mutation that triggers the materialized-view refresh.
 */
export function useRefreshMatviews() {
  return useMutation({
    mutationFn: () => refreshMatviewsFn(),
  });
}
