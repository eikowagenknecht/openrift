import type { CopyListResponse, CopyResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { CopiesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCopies = createServerFn({ method: "GET" })
  .inputValidator((input: { collectionId?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<CopiesResponse> => {
    const baseUrl = data.collectionId
      ? `${API_URL}/api/v1/collections/${encodeURIComponent(data.collectionId)}/copies`
      : `${API_URL}/api/v1/copies`;

    const allItems: CopyResponse[] = [];
    let cursor: string | null = null;

    // Paginate through all pages to ensure we fetch every copy.
    do {
      const params = new URLSearchParams();
      if (cursor) {
        params.set("cursor", cursor);
      }
      const query = params.toString();
      const url = query ? `${baseUrl}?${query}` : baseUrl;
      const res = await fetch(url, {
        headers: { cookie: context.cookie },
      });
      if (!res.ok) {
        throw new Error(`Copies fetch failed: ${res.status}`);
      }
      const page = (await res.json()) as CopiesResponse;
      allItems.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return { items: allItems, nextCursor: null };
  });

export function copiesQueryOptions(collectionId?: string) {
  return queryOptions({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: () => fetchCopies({ data: { collectionId } }),
    select: (data: CopyListResponse) => data.items,
    // Default 0 means every subscriber mount triggers a refetch. 5 min
    // matches the other user-scoped caches and invalidations still work.
    staleTime: 5 * 60 * 1000,
  });
}
