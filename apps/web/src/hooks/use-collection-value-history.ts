import type {
  CollectionValueHistoryResponse,
  CompletionScopePreference,
  Marketplace,
  TimeRange,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

interface ValueHistoryInput {
  marketplace: string;
  range: string;
  collectionIds?: string;
  scope: string;
}

const fetchCollectionValueHistory = createServerFn({ method: "GET" })
  .inputValidator((input: ValueHistoryInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CollectionValueHistoryResponse> => {
    const params = new URLSearchParams({
      marketplace: data.marketplace,
      range: data.range,
    });
    if (data.collectionIds) {
      params.set("collectionIds", data.collectionIds);
    }

    // Parse scope JSON and add individual params
    const scope = JSON.parse(data.scope) as CompletionScopePreference;
    if (scope.sets?.length) {
      params.set("sets", scope.sets.join(","));
    }
    if (scope.languages?.length) {
      params.set("languages", scope.languages.join(","));
    }
    if (scope.domains?.length) {
      params.set("domains", scope.domains.join(","));
    }
    if (scope.types?.length) {
      params.set("types", scope.types.join(","));
    }
    if (scope.rarities?.length) {
      params.set("rarities", scope.rarities.join(","));
    }
    if (scope.finishes?.length) {
      params.set("finishes", scope.finishes.join(","));
    }
    if (scope.artVariants?.length) {
      params.set("artVariants", scope.artVariants.join(","));
    }
    if (scope.promos) {
      params.set("promos", scope.promos);
    }
    if (scope.signed !== undefined) {
      params.set("signed", String(scope.signed));
    }
    if (scope.banned !== undefined) {
      params.set("banned", String(scope.banned));
    }
    if (scope.errata !== undefined) {
      params.set("errata", String(scope.errata));
    }

    return fetchApiJson<CollectionValueHistoryResponse>({
      errorTitle: "Couldn't load collection value history",
      cookie: context.cookie,
      path: `/api/v1/collection-value-history?${params.toString()}`,
    });
  });

/**
 * Fetches collection value over time, respecting marketplace, time range, collection, and scope filters.
 *
 * @returns Query result with the value history time series.
 */
export function useCollectionValueHistory(
  marketplace: Marketplace,
  range: TimeRange,
  collectionId?: string,
  scope?: CompletionScopePreference,
) {
  const scopeStr = JSON.stringify(scope ?? {});
  return useQuery({
    queryKey: queryKeys.collectionValueHistory.byParams(marketplace, range, collectionId, scopeStr),
    queryFn: () =>
      fetchCollectionValueHistory({
        data: {
          marketplace,
          range,
          collectionIds: collectionId,
          scope: scopeStr,
        },
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
