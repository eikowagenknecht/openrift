import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApi } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const refreshMatviewsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await fetchApi({
      errorTitle: "Couldn't refresh materialized views",
      cookie: context.cookie,
      path: "/api/v1/admin/refresh-materialized-views",
      method: "POST",
    });
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
