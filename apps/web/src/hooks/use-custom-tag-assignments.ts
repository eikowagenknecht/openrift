import type { CatalogResponse } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { catalogQueryOptions } from "@/lib/catalog-query";

/**
 * Card id → admin-curated custom-tag slugs (sorted). Read from the catalog
 * response; consulted only by the freeform deck-builder's custom-tag filter
 * so the data stays invisible to standard UI even though it's already loaded.
 *
 * Shares the underlying `/catalog` fetch with `useCards()` — different
 * `select` transforms compute their own derived shapes from the same cache
 * entry, so there's no extra network or origin work.
 *
 * @returns Record of card id → custom-tag slugs.
 */
export function useCustomTagAssignments(): Record<string, readonly string[]> {
  const { data } = useSuspenseQuery({
    ...catalogQueryOptions,
    select: (catalog: CatalogResponse) => catalog.customTagAssignments,
  });
  return data;
}
