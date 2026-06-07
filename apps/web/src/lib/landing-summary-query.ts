import type { LandingSummaryResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { browserApiClient, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";

const fetchLandingSummary = createServerFn({ method: "GET" }).handler(
  (): Promise<LandingSummaryResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "landing-summary"],
      queryFn: () =>
        callApiJson(
          serverApiClient().api.v1["landing-summary"].$get(),
          "Couldn't load landing summary",
        ),
    }),
);

// Client-side fetch goes directly at /api/v1/landing-summary so Cloudflare
// can serve it from the edge cache. Routing through the Start server function
// would re-enter origin for every visitor, defeating the whole point.
function fetchLandingSummaryFromEdge(): Promise<LandingSummaryResponse> {
  return callApiJson(
    browserApiClient().api.v1["landing-summary"].$get(),
    "Couldn't load landing summary",
  );
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
