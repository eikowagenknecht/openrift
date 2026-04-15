import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { DistinctArtistsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchDistinctArtists = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<DistinctArtistsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/distinct-artists`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Distinct artists fetch failed: ${res.status}`);
    }
    return res.json() as Promise<DistinctArtistsResponse>;
  });

export const adminDistinctArtistsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.distinctArtists,
  queryFn: () => fetchDistinctArtists(),
  staleTime: 30 * 60 * 1000,
});

export function useDistinctArtists() {
  return useSuspenseQuery(adminDistinctArtistsQueryOptions);
}
