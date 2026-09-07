import type { CollectionResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { useUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";

/**
 * Resolves the collection a deck is stored in. Safe with no signed-in
 * viewer: an anonymous viewer has no collections to match against.
 */
export function useHomeCollection(collectionId?: string | null): CollectionResponse | undefined {
  const userId = useUserId();
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(userId ?? ""),
    enabled: Boolean(userId) && Boolean(collectionId),
  });
  if (!collectionId) {
    return undefined;
  }
  return collections?.find((collection) => collection.id === collectionId);
}
