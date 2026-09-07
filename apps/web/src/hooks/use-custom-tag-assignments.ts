import type { CatalogResponse } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { catalogQueryOptions } from "@/lib/catalog-query";

/** Shares the underlying `/catalog` fetch with `useCards()` via a separate `select`, no extra network call. */
export function useCustomTagAssignments(): Record<string, readonly string[]> {
  const { data } = useSuspenseQuery({
    ...catalogQueryOptions,
    select: (catalog: CatalogResponse) => catalog.customTagAssignments,
  });
  return data;
}
