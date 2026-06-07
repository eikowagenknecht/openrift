import type { CopyListResponse, CopyResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { browserApiClient, callApiJson, encodeParams } from "@/lib/server-fns/api-client";

export async function fetchCopies(collectionId?: string): Promise<CopyListResponse> {
  const client = browserApiClient();
  const allItems: CopyResponse[] = [];
  let cursor: string | null = null;

  // Same-origin fetch — cookies flow automatically, no server-function proxy.
  // Typed via the browser hc client (route + response checked against the API
  // contract). Paginate through all pages to ensure we fetch every copy; the
  // global feed and the per-collection feed are distinct typed routes.
  do {
    const query = cursor ? { cursor } : {};
    // Annotated to break the cursor → query → page → cursor inference cycle the
    // loop creates (TS otherwise widens these to `any`).
    const page: CopyListResponse = collectionId
      ? await callApiJson(
          client.api.v1.collections[":id"].copies.$get({
            param: encodeParams({ id: collectionId }),
            query,
          }),
          "Couldn't load copies",
        )
      : await callApiJson(client.api.v1.copies.$get({ query }), "Couldn't load copies");
    allItems.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { items: allItems, nextCursor: null };
}

export function copiesQueryOptions(userId: string, collectionId?: string) {
  return queryOptions({
    queryKey: collectionId
      ? queryKeys.copies.byCollection(userId, collectionId)
      : queryKeys.copies.all(userId),
    queryFn: () => fetchCopies(collectionId),
    select: (data: CopyListResponse) => data.items,
    // Default 0 means every subscriber mount triggers a refetch. 5 min
    // matches the other user-scoped caches and invalidations still work.
    staleTime: 5 * 60 * 1000,
  });
}
