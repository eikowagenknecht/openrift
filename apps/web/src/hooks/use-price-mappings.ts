import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AssignableCard,
  MappingGroup,
  SourceMappingConfig,
  StagedProduct,
} from "@/components/admin/price-mappings-types";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface MappingsResponse {
  groups: MappingGroup[];
  unmatchedProducts: StagedProduct[];
  ignoredProducts: StagedProduct[];
  allCards: AssignableCard[];
}

export function usePriceMappings(config: SourceMappingConfig, showAll = false) {
  return useQuery({
    queryKey: queryKeys.admin.priceMappings.bySourceAndFilter(config, showAll),
    queryFn: () => {
      const url = showAll ? `${config.apiPath}?all=true` : config.apiPath;
      return api.get<MappingsResponse>(url);
    },
  });
}

// Shared helper — every mutation invalidates the same query key on success.
function useMappingMutation<TInput, TResult>(
  config: SourceMappingConfig,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

interface SaveMappingsBody {
  mappings: { printingId: string; externalId: number }[];
}

export function useSavePriceMappings(config: SourceMappingConfig) {
  return useMappingMutation(config, (body: SaveMappingsBody) =>
    api.post<{ saved: number }>(config.apiPath, body),
  );
}

export function useUnmapAllMappings(config: SourceMappingConfig) {
  return useMappingMutation(config, () =>
    api.del<{ ok: boolean; unmapped: number }>(`${config.apiPath}/all`),
  );
}

export function useUnmapPrinting(config: SourceMappingConfig) {
  return useMappingMutation(config, (printingId: string) =>
    api.del<{ ok: boolean }>(config.apiPath, { printingId }),
  );
}

interface StagingCardOverride {
  externalId: number;
  finish: string;
  cardId: string;
}

export function useAssignToCard(config: SourceMappingConfig) {
  return useMappingMutation(config, (override: StagingCardOverride) =>
    api.post<{ ok: boolean }>("/api/admin/staging-card-overrides", {
      source: config.source,
      ...override,
    }),
  );
}

interface UnassignFromCard {
  externalId: number;
  finish: string;
}

export function useUnassignFromCard(config: SourceMappingConfig) {
  return useMappingMutation(config, (params: UnassignFromCard) =>
    api.del<{ ok: boolean }>("/api/admin/staging-card-overrides", {
      source: config.source,
      ...params,
    }),
  );
}

interface IgnoreProduct {
  externalId: number;
  finish: string;
}

export function useIgnoreProducts(config: SourceMappingConfig) {
  return useMappingMutation(config, (products: IgnoreProduct[]) =>
    api.post<{ ok: boolean; ignored: number }>("/api/admin/ignored-products", {
      source: config.source,
      products,
    }),
  );
}

export function useUnignoreProducts(config: SourceMappingConfig) {
  return useMappingMutation(config, (products: IgnoreProduct[]) =>
    api.del<{ ok: boolean; unignored: number }>("/api/admin/ignored-products", {
      source: config.source,
      products,
    }),
  );
}
