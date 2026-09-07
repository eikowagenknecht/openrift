import { collectionValueHistoryContract } from "@openrift/shared/contracts/collection-value-history";
import type { CollectionValueHistoryResponse } from "@openrift/shared/types/api/collection-value-history";
import type { CompletionScopePreference } from "@openrift/shared/types/api/preferences";
import {
  COMPLETION_SCOPE_ARRAY_KEYS,
  COMPLETION_SCOPE_SCALAR_KEYS,
} from "@openrift/shared/types/api/preferences";
import type { Marketplace, TimeRange } from "@openrift/shared/types/pricing";
import type { ContractRouterClient } from "@orpc/contract";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { collectionValueHistoryKeys } from "@/features/collections/lib/collections-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
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

    // Array axes travel as comma-separated lists; the shared key tuples drive the mapping.
    const scope = JSON.parse(data.scope) as CompletionScopePreference;
    for (const key of COMPLETION_SCOPE_ARRAY_KEYS) {
      const values = scope[key] as string[] | undefined;
      if (values?.length) {
        query[key] = values.join(",");
      }
    }
    for (const key of COMPLETION_SCOPE_SCALAR_KEYS) {
      const value = scope[key];
      if (value !== undefined) {
        query[key] = String(value);
      }
    }

    return apiOrpcClient(collectionValueHistoryContract, context.cookie).get(
      query as ValueHistoryQuery,
    );
  });

export function useCollectionValueHistory(
  marketplace: Marketplace,
  range: TimeRange,
  collectionId?: string,
  scope?: CompletionScopePreference,
) {
  const userId = useRequiredUserId();
  const scopeStr = JSON.stringify(scope ?? {});
  return useQuery({
    queryKey: collectionValueHistoryKeys.byParams(
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
    // The wire carries integer cents; convert to major-unit `value` at this boundary.
    select: (data) => ({
      series: data.series.map((point) => ({
        date: point.date,
        value: point.valueCents / 100,
        baselineValue: point.baselineValueCents / 100,
        copyCount: point.copyCount,
      })),
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
