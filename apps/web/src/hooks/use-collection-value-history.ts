import type {
  CollectionValueHistoryResponse,
  CompletionScopePreference,
  Marketplace,
  TimeRange,
} from "@openrift/shared";
import { collectionValueHistoryContract } from "@openrift/shared/contracts/collection-value-history";
import type { ContractRouterClient } from "@orpc/contract";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

type ValueHistoryQuery = Parameters<
  ContractRouterClient<typeof collectionValueHistoryContract>["get"]
>[0];

interface ValueHistoryInput {
  marketplace: string;
  range: string;
  collectionIds?: string;
  scope: string;
}

// Scope axes carried as comma-separated lists. The query param and the scope
// field share a name, so this one list drives both ends of the mapping.
const CSV_SCOPE_KEYS = [
  "sets",
  "languages",
  "domains",
  "types",
  "rarities",
  "finishes",
  "artVariants",
  "keywords",
  "tags",
  "customTags",
  "cardSizes",
  "setsExclude",
  "languagesExclude",
  "domainsExclude",
  "typesExclude",
  "raritiesExclude",
  "finishesExclude",
  "artVariantsExclude",
  "keywordsExclude",
  "tagsExclude",
  "customTagsExclude",
] as const satisfies readonly (keyof CompletionScopePreference)[];

// Scope axes carried as a single value (tri-state flags and presence states).
const SCALAR_SCOPE_KEYS = [
  "promos",
  "signed",
  "banned",
  "errata",
  "standard",
  "keywordsPresence",
  "tagsPresence",
  "customTagsPresence",
] as const satisfies readonly (keyof CompletionScopePreference)[];

const fetchCollectionValueHistory = createServerFn({ method: "GET" })
  .validator((input: ValueHistoryInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CollectionValueHistoryResponse> => {
    const query: Record<string, string> = {
      marketplace: data.marketplace,
      range: data.range,
    };
    if (data.collectionIds) {
      query.collectionIds = data.collectionIds;
    }

    // Every scope axis travels under its own field name, so one list per
    // shape drives the whole mapping instead of an if per dimension.
    const scope = JSON.parse(data.scope) as CompletionScopePreference;
    for (const key of CSV_SCOPE_KEYS) {
      const values = scope[key] as string[] | undefined;
      if (values?.length) {
        query[key] = values.join(",");
      }
    }
    for (const key of SCALAR_SCOPE_KEYS) {
      const value = scope[key];
      if (value !== undefined) {
        query[key] = String(value);
      }
    }

    return apiOrpcClient(collectionValueHistoryContract, context.cookie).get(
      query as ValueHistoryQuery,
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
