import type { LandingSummaryResponse } from "@openrift/shared";
import { landingSummaryContract } from "@openrift/shared/contracts";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchLandingSummary = createServerFn({ method: "GET" }).handler(
  (): Promise<LandingSummaryResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "landing-summary"],
      queryFn: () => apiOrpcClient(landingSummaryContract).get(),
    }),
);

// Client-side fetch goes directly at /api/v1/landing-summary so Cloudflare
// can serve it from the edge cache. Routing through the Start server function
// would re-enter origin for every visitor, defeating the whole point. Must use
// the BROWSER client (same-origin): the server `apiOrpcClient` targets the
// internal API base, which in the browser bundle is the localhost:3000 dev
// fallback — a cross-origin URL the production CSP blocks. No cookie is passed:
// the browser sends the same-origin cookie automatically.
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
