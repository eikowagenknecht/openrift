import type { CopyListResponse, CopyResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { CopiesResponse } from "@/lib/server-fns/api-types";

export async function fetchCopies(collectionId?: string): Promise<CopiesResponse> {
  const baseUrl = collectionId
    ? `/api/v1/collections/${encodeURIComponent(collectionId)}/copies`
    : "/api/v1/copies";

  const allItems: CopyResponse[] = [];
  let cursor: string | null = null;

  // Same-origin fetch — cookies flow automatically, no server-function proxy.
  // Paginate through all pages to ensure we fetch every copy.
  do {
    const params = new URLSearchParams();
    if (cursor) {
      params.set("cursor", cursor);
    }
    const query = params.toString();
    const url = query ? `${baseUrl}?${query}` : baseUrl;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Copies fetch failed: ${res.status}`);
    }
    const page = (await res.json()) as CopiesResponse;
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
