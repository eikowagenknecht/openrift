import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { DistinctArtistsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchDistinctArtists = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<DistinctArtistsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.cards["distinct-artists"].$get(),
        "Couldn't load distinct artists",
      ),
  );

export const adminDistinctArtistsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.distinctArtists,
  queryFn: () => fetchDistinctArtists(),
  staleTime: 30 * 60 * 1000,
});

export function useDistinctArtists() {
  return useSuspenseQuery(adminDistinctArtistsQueryOptions);
}
