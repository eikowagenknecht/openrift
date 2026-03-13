import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AssignableCard,
  StagedProduct,
  UnifiedMappingGroup,
} from "@/components/admin/price-mappings-types";
import { CM_CONFIG, TCG_CONFIG } from "@/components/admin/source-configs";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface UnifiedMappingsResponse {
  groups: UnifiedMappingGroup[];
  unmatchedProducts: {
    tcgplayer: StagedProduct[];
    cardmarket: StagedProduct[];
  };
  allCards: AssignableCard[];
}

export function useUnifiedMappings(showAll = false) {
  return useQuery({
    queryKey: queryKeys.admin.unifiedMappings.byFilter(showAll),
    queryFn: () => {
      const url = showAll
        ? "/api/admin/marketplace-mappings?all=true"
        : "/api/admin/marketplace-mappings";
      return api.get<UnifiedMappingsResponse>(url);
    },
  });
}

// Mutations invalidate both the unified query and the per-marketplace queries.
function useUnifiedMutation<TInput, TResult>(
  marketplace: "tcgplayer" | "cardmarket",
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const config = marketplace === "tcgplayer" ? TCG_CONFIG : CM_CONFIG;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.unifiedMappings.all,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

interface SaveMappingsBody {
  mappings: { printingId: string; externalId: number }[];
}

export function useUnifiedSaveMappings(marketplace: "tcgplayer" | "cardmarket") {
  const config = marketplace === "tcgplayer" ? TCG_CONFIG : CM_CONFIG;
  return useUnifiedMutation(marketplace, (body: SaveMappingsBody) =>
    api.post<{ saved: number }>(config.apiPath, body),
  );
}

export function useUnifiedUnmapPrinting(marketplace: "tcgplayer" | "cardmarket") {
  const config = marketplace === "tcgplayer" ? TCG_CONFIG : CM_CONFIG;
  return useUnifiedMutation(marketplace, (printingId: string) =>
    api.del<{ ok: boolean }>(config.apiPath, { printingId }),
  );
}

export function useUnifiedIgnoreProducts(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(marketplace, (products: { externalId: number; finish: string }[]) =>
    api.post<{ ok: boolean; ignored: number }>("/api/admin/ignored-products", {
      source: marketplace,
      products,
    }),
  );
}

export function useUnifiedAssignToCard(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(
    marketplace,
    (override: { externalId: number; finish: string; cardId: string }) =>
      api.post<{ ok: boolean }>("/api/admin/staging-card-overrides", {
        source: marketplace,
        ...override,
      }),
  );
}

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket") {
  return useUnifiedMutation(marketplace, (params: { externalId: number; finish: string }) =>
    api.del<{ ok: boolean }>("/api/admin/staging-card-overrides", {
      source: marketplace,
      ...params,
    }),
  );
}
