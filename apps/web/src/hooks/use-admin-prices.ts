import type { ClearPricesResponse, JobRunStartedResponse } from "@openrift/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import {
  clearActions,
  getLatestJobRunFn,
  refreshActions,
} from "@/components/admin/refresh-actions";
import type { JobRunView } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

// ── Server function for clear prices ─────────────────────────────────────────

const clearPricesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<ClearPricesResponse>({
      errorTitle: "Couldn't clear prices",
      cookie: context.cookie,
      path: "/api/v1/admin/clear-prices",
      method: "POST",
      body: { marketplace: data.marketplace },
    }),
  );

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRefreshPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const refreshAction = refreshActions[cronKey];
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> =>
      refreshAction.post() as Promise<JobRunStartedResponse>,
  });
}

/**
 * Poll the latest job_runs row for a given kind. Refetches every 5s while
 * the latest run is 'running', and every 60s otherwise so stale post-success
 * state updates if a cron kicks off a new run in the background.
 *
 * @returns A react-query `UseQueryResult<JobRunView | null>`.
 */
export function useLatestJobRun(kind: string) {
  return useQuery({
    queryKey: ["admin", "job-runs", kind],
    queryFn: async (): Promise<JobRunView | null> => {
      const response = await getLatestJobRunFn({ data: { kind } });
      return response.runs[0] ?? null;
    },
    refetchInterval: (query) => (query.state.data?.status === "running" ? 5000 : 60_000),
  });
}

export function useClearPrices(cronKey: "tcgplayer" | "cardmarket" | "cardtrader") {
  const clearAction = clearActions[cronKey];
  return useMutation({
    mutationFn: (): Promise<ClearPricesResponse> =>
      clearPricesFn({ data: { marketplace: clearAction.source } }),
  });
}
