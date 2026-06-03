import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { callApi, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const refreshMatviewsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["refresh-materialized-views"].$post(),
      "Couldn't refresh materialized views",
    );
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
