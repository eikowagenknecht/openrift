import type { DeckCatalogSubset } from "@openrift/shared/types/api/deck";
import type { ReactNode } from "react";

import { CatalogSubsetContext } from "@/hooks/catalog-subset-context";
import { enrichCatalogSubset } from "@/lib/catalog-query";

/**
 * Serves `useCards` from the slice of the catalogue a page already holds, so
 * nothing under it fetches or dehydrates the whole thing.
 */
export function CatalogSubsetProvider({
  catalog,
  children,
}: {
  catalog: DeckCatalogSubset;
  children: ReactNode;
}) {
  return (
    <CatalogSubsetContext value={enrichCatalogSubset(catalog)}>{children}</CatalogSubsetContext>
  );
}
