import type { UnifiedMappingsResponse } from "@openrift/shared";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export function unifiedMappingsQueryOptions(showAll = false) {
  return queryOptions({
    queryKey: queryKeys.admin.unifiedMappings.byFilter(showAll),
    queryFn: () =>
      rpc(
        client.api.admin["marketplace-mappings"].$get({
          query: { all: showAll ? "true" : undefined },
        }),
        // Server uses unknown[] for stagedProducts — cast to local types
      ) as unknown as Promise<UnifiedMappingsResponse>,
  });
}

export function useUnifiedMappings(showAll = false) {
  return useSuspenseQuery(unifiedMappingsQueryOptions(showAll));
}

// Mutations invalidate both the unified query and the per-marketplace queries.
function useUnifiedMutation<TInput, TResult>(
  marketplace: "tcgplayer" | "cardmarket",
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

export function useUnifiedSaveMappings(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(marketplace, (body: SaveMappingsBody) =>
    rpc(
      client.api.admin["marketplace-mappings"].$post({
        query: { marketplace },
        json: body,
      }),
    ),
  );
}

export function useUnifiedUnmapPrinting(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(marketplace, (printingId: string) =>
    rpc(
      client.api.admin["marketplace-mappings"].$delete({
        query: { marketplace },
        json: { printingId },
      }),
    ),
  );
}

export function useUnifiedIgnoreProducts(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(marketplace, (products: { externalId: number; finish: string }[]) =>
    rpc(
      client.api.admin["ignored-products"].$post({
        json: { marketplace, products },
      }),
    ),
  );
}

export function useUnifiedAssignToCard(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(
    marketplace,
    (override: { externalId: number; finish: string; cardId: string }) =>
      rpc(
        client.api.admin["staging-card-overrides"].$post({
          json: { marketplace, ...override },
        }),
      ),
  );
}

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(marketplace, (params: { externalId: number; finish: string }) =>
    rpc(
      client.api.admin["staging-card-overrides"].$delete({
        json: { marketplace, ...params },
      }),
    ),
  );
}
