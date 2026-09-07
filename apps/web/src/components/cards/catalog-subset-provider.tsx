import type { DeckCatalogSubset } from "@openrift/shared";
import { createContext } from "react";
import type { ReactNode } from "react";

import type { UseCardsResult } from "@/lib/catalog-query";
import { enrichCatalogSubset } from "@/lib/catalog-query";

/** Null outside a provider: `useCards` falls back to the catalogue query in that case. */
export const CatalogSubsetContext = createContext<UseCardsResult | null>(null);

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
