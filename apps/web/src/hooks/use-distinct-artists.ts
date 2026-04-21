import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { DistinctArtistsResponse } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchDistinctArtists = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<DistinctArtistsResponse> =>
      fetchApiJson<DistinctArtistsResponse>({
        errorTitle: "Couldn't load distinct artists",
        cookie: context.cookie,
        path: "/api/v1/admin/cards/distinct-artists",
      }),
  );

export const adminDistinctArtistsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.distinctArtists,
  queryFn: () => fetchDistinctArtists(),
  staleTime: 30 * 60 * 1000,
});

export function useDistinctArtists() {
  return useSuspenseQuery(adminDistinctArtistsQueryOptions);
}
