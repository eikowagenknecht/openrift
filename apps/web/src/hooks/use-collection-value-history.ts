import type {
  CollectionValueHistoryResponse,
  CompletionScopePreference,
  Marketplace,
  TimeRange,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
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
    const query: Record<string, string> = {
      marketplace: data.marketplace,
      range: data.range,
    };
    if (data.collectionIds) {
      query.collectionIds = data.collectionIds;
    }

    // Parse scope JSON and add individual params
    const scope = JSON.parse(data.scope) as CompletionScopePreference;
    if (scope.sets?.length) {
      query.sets = scope.sets.join(",");
    }
    if (scope.languages?.length) {
      query.languages = scope.languages.join(",");
    }
    if (scope.domains?.length) {
      query.domains = scope.domains.join(",");
    }
    if (scope.types?.length) {
      query.types = scope.types.join(",");
    }
    if (scope.rarities?.length) {
      query.rarities = scope.rarities.join(",");
    }
    if (scope.finishes?.length) {
      query.finishes = scope.finishes.join(",");
    }
    if (scope.artVariants?.length) {
      query.artVariants = scope.artVariants.join(",");
    }
    if (scope.promos) {
      query.promos = scope.promos;
    }
    if (scope.signed !== undefined) {
      query.signed = String(scope.signed);
    }
    if (scope.banned !== undefined) {
      query.banned = String(scope.banned);
    }
    if (scope.errata !== undefined) {
      query.errata = String(scope.errata);
    }

    return callApiJson(
      serverApiClient(context.cookie).api.v1["collection-value-history"].$get({ query }),
      "Couldn't load collection value history",
    );
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
  const userId = useRequiredUserId();
  const scopeStr = JSON.stringify(scope ?? {});
  return useQuery({
    queryKey: queryKeys.collectionValueHistory.byParams(
      userId,
      marketplace,
      range,
      collectionId,
      scopeStr,
    ),
    queryFn: () =>
      fetchCollectionValueHistory({
        data: {
          marketplace,
          range,
          collectionIds: collectionId,
          scope: scopeStr,
        },
      }),
    // The wire carries integer cents; expose major-unit `value` to the
    // chart at this single boundary so display code stays unit-agnostic.
    select: (data) => ({
      series: data.series.map((point) => ({
        date: point.date,
        value: point.valueCents / 100,
        copyCount: point.copyCount,
      })),
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
