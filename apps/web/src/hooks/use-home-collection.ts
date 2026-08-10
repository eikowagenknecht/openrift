import type { CollectionResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { useUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";

/**
 * Resolves the collection a deck is stored in (its deck box). Safe on surfaces
 * with no signed-in viewer — the public deck share never carries a
 * `collectionId`, and an anonymous viewer has no collections to match it
 * against.
 * @returns The box collection, or undefined while it loads, when the deck has
 *   no box, or when the id belongs to someone else.
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
