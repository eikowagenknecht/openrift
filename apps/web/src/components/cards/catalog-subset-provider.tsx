import type { DeckCatalogSubset } from "@openrift/shared";
import { createContext } from "react";
import type { ReactNode } from "react";

import type { UseCardsResult } from "@/lib/catalog-query";
import { enrichCatalogSubset } from "@/lib/catalog-query";

/** Null outside a provider, which is what makes `useCards` fall back to the catalogue query. */
export const CatalogSubsetContext = createContext<UseCardsResult | null>(null);

/**
 * Serves `useCards` from the slice of the catalogue a page already holds, so
 * nothing under it fetches or dehydrates the whole thing. A consumer that has
 * to resolve a card outside the slice calls `useFullCatalog` instead.
 * @returns The provider.
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
