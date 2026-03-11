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

interface SaveMappingsBody {
  mappings: { printingId: string; externalId: number }[];
}

export function useSavePriceMappings(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveMappingsBody) => api.post<{ saved: number }>(config.apiPath, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

export function useUnmapAllMappings(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<{ ok: boolean; unmapped: number }>(`${config.apiPath}/all`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

export function useUnmapPrinting(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (printingId: string) => api.del<{ ok: boolean }>(config.apiPath, { printingId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

interface StagingCardOverride {
  externalId: number;
  finish: string;
  cardId: string;
  setId: string;
}

export function useAssignToCard(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (override: StagingCardOverride) =>
      api.post<{ ok: boolean }>("/api/admin/staging-card-overrides", {
        source: config.source,
        ...override,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

interface UnassignFromCard {
  externalId: number;
  finish: string;
}

export function useUnassignFromCard(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: UnassignFromCard) =>
      api.del<{ ok: boolean }>("/api/admin/staging-card-overrides", {
        source: config.source,
        ...params,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

interface IgnoreProduct {
  externalId: number;
  finish: string;
}

export function useIgnoreProducts(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (products: IgnoreProduct[]) =>
      api.post<{ ok: boolean; ignored: number }>("/api/admin/ignored-products", {
        source: config.source,
        products,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

export function useUnignoreProducts(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (products: IgnoreProduct[]) =>
      api.del<{ ok: boolean; unignored: number }>("/api/admin/ignored-products", {
        source: config.source,
        products,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}
