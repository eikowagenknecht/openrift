import type { UnifiedMappingsResponse } from "@openrift/shared";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export function unifiedMappingsQueryOptions(showAll = false) {
  return queryOptions({
    queryKey: queryKeys.admin.unifiedMappings.byFilter(showAll),
    queryFn: async () => {
      const res = await client.api.v1.admin["marketplace-mappings"].$get({
        query: { all: showAll ? "true" : undefined },
      });
      assertOk(res);
      // Server uses unknown[] for stagedProducts — cast to local types
      return (await res.json()) as unknown as UnifiedMappingsResponse;
    },
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
    const res = await client.api.v1.admin["marketplace-mappings"].$post({
      query: { marketplace },
      json: body,
    });
    assertOk(res);
    const result = await res.json();
    const typed = result as { saved: number; skipped?: { externalId: number; reason: string }[] };
    if (typed.skipped && typed.skipped.length > 0) {
      for (const s of typed.skipped) {
        toast.error(`#${s.externalId}: ${s.reason}`);
      }
    }
    return result;
  });
}

export function useUnifiedUnmapPrinting(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (printingId: string) => {
    const res = await client.api.v1.admin["marketplace-mappings"].$delete({
      query: { marketplace },
      json: { printingId },
    });
    assertOk(res);
  });
}

export function useUnifiedIgnoreProducts(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (products: { externalId: number; finish: string }[]) => {
      const res = await client.api.v1.admin["ignored-products"].$post({
        json: { marketplace, products },
      });
      assertOk(res);
    },
  );
}

export function useUnifiedAssignToCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (override: { externalId: number; finish: string; cardId: string }) => {
      const res = await client.api.v1.admin["staging-card-overrides"].$post({
        json: { marketplace, ...override },
      });
      assertOk(res);
    },
  );
}

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (params: { externalId: number; finish: string }) => {
    const res = await client.api.v1.admin["staging-card-overrides"].$delete({
      json: { marketplace, ...params },
    });
    assertOk(res);
  });
}
