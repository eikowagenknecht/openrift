import type { LandingSummaryResponse } from "@openrift/shared";
import { landingSummaryContract } from "@openrift/shared/contracts/landing-summary";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchLandingSummary = createServerFn({ method: "GET" }).handler(
  (): Promise<LandingSummaryResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "landing-summary"],
      queryFn: () => apiOrpcClient(landingSummaryContract).get(),
    }),
);

// Must use the browser client: the server client's base degrades to a
// CSP-blocked localhost:3000 in the browser bundle.
function fetchLandingSummaryFromEdge(): Promise<LandingSummaryResponse> {
  return browserApiOrpcClient(landingSummaryContract).get();
}

export const landingSummaryQueryOptions = queryOptions({
  queryKey: queryKeys.landingSummary.all,
  queryFn: () =>
    globalThis.window === undefined ? fetchLandingSummary() : fetchLandingSummaryFromEdge(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: 1,
  retryDelay: 500,
});
