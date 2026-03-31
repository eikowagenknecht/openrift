import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export const adminDistinctArtistsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.distinctArtists,
  queryFn: async () => {
    const res = await client.api.v1.admin.cards["distinct-artists"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useDistinctArtists() {
  return useSuspenseQuery(adminDistinctArtistsQueryOptions);
}
