// Catalog collections are per-QueryClient singletons. This binds them to the
// router's QueryClient so the catalog fetch dedupes with every other consumer
// of `catalogQueryOptions` (landing page, totalCopies lookup, etc.).
//
// On the server, `getRouter()` creates a fresh QueryClient per request, so
// each request gets its own set of collections. On the client, the QueryClient
// is stable for the app lifetime, so the collections are effectively module
// singletons — but naturally, without reinventing per-request isolation.

import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
} from "@openrift/shared";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";

import { catalogQueryOptions } from "@/lib/catalog-query";

export type CatalogSetItem = CatalogSetResponse;
export type CatalogCardItem = CatalogResponseCardValue & { id: string };
export type CatalogPrintingItem = CatalogResponsePrintingValue & { id: string };

export interface CatalogCollections {
  sets: Collection<CatalogSetItem, string | number>;
  cards: Collection<CatalogCardItem, string | number>;
  printings: Collection<CatalogPrintingItem, string | number>;
}

const cache = new WeakMap<QueryClient, CatalogCollections>();

export function getCatalogCollections(queryClient: QueryClient): CatalogCollections {
  const existing = cache.get(queryClient);
  if (existing) {
    return existing;
  }

  // All three collections share the underlying catalog fetch via ensureQueryData
  // on catalogQueryOptions.queryKey. Concurrent callers join the in-flight
  // promise inside the QueryClient, so cold-start yields a single network
  // request regardless of how many subscribers.
  const ensureCatalog = (): Promise<CatalogResponse> =>
    queryClient.ensureQueryData({
      queryKey: catalogQueryOptions.queryKey,
      queryFn: catalogQueryOptions.queryFn,
      staleTime: catalogQueryOptions.staleTime,
    });

  const collections: CatalogCollections = {
    sets: createCollection(
      queryCollectionOptions<CatalogSetItem>({
        id: "catalog-sets",
        queryClient,
        queryKey: ["catalog-collection", "sets"],
        queryFn: async () => {
          const catalog = await ensureCatalog();
          return catalog.sets;
        },
        getKey: (set) => set.id,
      }),
    ),
    cards: createCollection(
      queryCollectionOptions<CatalogCardItem>({
        id: "catalog-cards",
        queryClient,
        queryKey: ["catalog-collection", "cards"],
        queryFn: async () => {
          const catalog = await ensureCatalog();
          return Object.entries(catalog.cards).map(([id, card]) => ({ ...card, id }));
        },
        getKey: (card) => card.id,
      }),
    ),
    printings: createCollection(
      queryCollectionOptions<CatalogPrintingItem>({
        id: "catalog-printings",
        queryClient,
        queryKey: ["catalog-collection", "printings"],
        queryFn: async () => {
          const catalog = await ensureCatalog();
          return Object.entries(catalog.printings).map(([id, printing]) => ({
            ...printing,
            id,
          }));
        },
        getKey: (printing) => printing.id,
      }),
    ),
  };

  cache.set(queryClient, collections);
  return collections;
}
