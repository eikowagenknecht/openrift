import { adminCardQueriesContract } from "@openrift/shared/contracts/admin/card-queries";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import type { DistinctArtistsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchDistinctArtists = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<DistinctArtistsResponse> =>
    apiOrpcClient(adminCardQueriesContract, context.cookie).distinctArtists(),
  );

export const adminDistinctArtistsQueryOptions = queryOptions({
  queryKey: adminKeys.distinctArtists,
  queryFn: () => fetchDistinctArtists(),
  staleTime: 30 * 60 * 1000,
});

export function useDistinctArtists() {
  return useSuspenseQuery(adminDistinctArtistsQueryOptions);
}
