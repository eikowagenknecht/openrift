import { collectionsContract } from "@openrift/shared/contracts/collections";
import { copiesContract } from "@openrift/shared/contracts/copies";
import type { CopyListResponse, CopyResponse } from "@openrift/shared/types/api/collection";
import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

export async function fetchCopies(collectionId?: string): Promise<CopyListResponse> {
  const allItems: CopyResponse[] = [];
  let cursor: string | null = null;

  do {
    // Annotated to break the cursor -> query -> page -> cursor inference cycle (TS otherwise widens to `any`).
    const page: CopyListResponse = collectionId
      ? await browserApiOrpcClient(collectionsContract).copies({
          id: collectionId,
          ...(cursor ? { cursor } : {}),
        })
      : await browserApiOrpcClient(copiesContract).list(cursor ? { cursor } : {});
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
    staleTime: 5 * 60 * 1000,
  });
}
