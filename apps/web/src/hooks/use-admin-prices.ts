import type { ClearPricesResponse, JobRunStartedResponse } from "@openrift/shared";
import { adminOperationsContract } from "@openrift/shared/contracts/admin/operations";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { clearActions, getLatestJobRunFn, refreshActions } from "@/hooks/refresh-actions";
import type { JobRunView } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const clearPricesFn = createServerFn({ method: "POST" })
  // The oRPC client enforces the route's marketplace enum; callers pass
  // clearActions[*].source, which is already one of these literals.
  .validator((input: { marketplace: "cardmarket" | "cardtrader" | "tcgplayer" }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ClearPricesResponse> =>
    apiOrpcClient(adminOperationsContract, context.cookie).clearPrices({
      marketplace: data.marketplace,
    }),
  );

export function useRefreshPrices(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  const refreshAction = refreshActions[marketplace];
  return useMutation({
    mutationFn: (): Promise<JobRunStartedResponse> =>
      refreshAction.post() as Promise<JobRunStartedResponse>,
  });
}

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

export function useClearPrices(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  const clearAction = clearActions[marketplace];
  return useMutation({
    mutationFn: (): Promise<ClearPricesResponse> =>
      clearPricesFn({ data: { marketplace: clearAction.source } }),
  });
}
