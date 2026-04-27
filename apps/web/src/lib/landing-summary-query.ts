import type { LandingSummaryResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";

const fetchLandingSummary = createServerFn({ method: "GET" }).handler(
  (): Promise<LandingSummaryResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "landing-summary"],
      queryFn: () =>
        fetchApiJson<LandingSummaryResponse>({
          errorTitle: "Couldn't load landing summary",
          path: "/api/v1/landing-summary",
        }),
    }),
);

// Client-side fetch goes directly at /api/v1/landing-summary so Cloudflare
// can serve it from the edge cache. Routing through the Start server function
// would re-enter origin for every visitor, defeating the whole point.
async function fetchLandingSummaryFromEdge(): Promise<LandingSummaryResponse> {
  const res = await fetch("/api/v1/landing-summary");
  if (!res.ok) {
    throw new Error(`Landing summary fetch failed: ${res.status}`);
  }
  return res.json() as Promise<LandingSummaryResponse>;
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
