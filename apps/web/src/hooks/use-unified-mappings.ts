import type { UnifiedMappingsResponse } from "@openrift/shared";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export function unifiedMappingsQueryOptions(showAll = false) {
  return queryOptions({
    queryKey: queryKeys.admin.unifiedMappings.byFilter(showAll),
    queryFn: () =>
      rpc(
        client.api.v1.admin["marketplace-mappings"].$get({
          query: { all: showAll ? "true" : undefined },
        }),
        // Server uses unknown[] for stagedProducts — cast to local types
      ) as unknown as Promise<UnifiedMappingsResponse>,
  });
}

export function useUnifiedMappings(showAll = false) {
  return useSuspenseQuery(unifiedMappingsQueryOptions(showAll));
}

/**
 * Mutations invalidate both the unified query and the per-marketplace queries.
 * @returns A mutation hook that invalidates relevant queries on success.
 */
function useUnifiedMutation<TInput, TResult>(
  marketplace: "tcgplayer" | "cardmarket" | "cardtrader",
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.unifiedMappings.all,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", marketplace] as const,
      });
    },
  });
}

interface SaveMappingsBody {
  mappings: { printingId: string; externalId: number }[];
}

export function useUnifiedSaveMappings(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (body: SaveMappingsBody) => {
    const result = await rpc(
      client.api.v1.admin["marketplace-mappings"].$post({
        query: { marketplace },
        json: body,
      }),
    );
    const res = result as { saved: number; skipped?: { externalId: number; reason: string }[] };
    if (res.skipped && res.skipped.length > 0) {
      for (const s of res.skipped) {
        toast.error(`#${s.externalId}: ${s.reason}`);
      }
    }
    return result;
  });
}

export function useUnifiedUnmapPrinting(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, (printingId: string) =>
    rpc(
      client.api.v1.admin["marketplace-mappings"].$delete({
        query: { marketplace },
        json: { printingId },
      }),
    ),
  );
}

export function useUnifiedIgnoreProducts(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, (products: { externalId: number; finish: string }[]) =>
    rpc(
      client.api.v1.admin["ignored-products"].$post({
        json: { marketplace, products },
      }),
    ),
  );
}

export function useUnifiedAssignToCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    (override: { externalId: number; finish: string; cardId: string }) =>
      rpc(
        client.api.v1.admin["staging-card-overrides"].$post({
          json: { marketplace, ...override },
        }),
      ),
  );
}

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, (params: { externalId: number; finish: string }) =>
    rpc(
      client.api.v1.admin["staging-card-overrides"].$delete({
        json: { marketplace, ...params },
      }),
    ),
  );
}
