import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AssignableCard,
  MappingGroup,
  SourceMappingConfig,
  StagedProduct,
} from "@/components/admin/price-mappings-types";
import { queryKeys } from "@/lib/query-keys";

interface MappingsResponse {
  groups: MappingGroup[];
  unmatchedProducts: StagedProduct[];
  ignoredProducts: StagedProduct[];
  allCards: AssignableCard[];
}

async function fetchMappings(
  config: SourceMappingConfig,
  showAll: boolean,
): Promise<MappingsResponse> {
  const url = showAll ? `${config.apiPath}?all=true` : config.apiPath;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${config.shortName} mappings: ${res.status}`);
  }
  return res.json() as Promise<MappingsResponse>;
}

export function usePriceMappings(config: SourceMappingConfig, showAll = false) {
  return useQuery({
    queryKey: queryKeys.admin.priceMappings.bySourceAndFilter(config, showAll),
    queryFn: () => fetchMappings(config, showAll),
  });
}

interface SaveMappingsBody {
  mappings: { printingId: string; externalId: number }[];
}

async function saveMappings(
  config: SourceMappingConfig,
  body: SaveMappingsBody,
): Promise<{ saved: number }> {
  const res = await fetch(config.apiPath, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to save ${config.shortName} mappings: ${res.status}`);
  }
  return res.json() as Promise<{ saved: number }>;
}

export function useSavePriceMappings(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveMappingsBody) => saveMappings(config, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

async function unmapAllMappings(
  config: SourceMappingConfig,
): Promise<{ ok: boolean; unmapped: number }> {
  const res = await fetch(`${config.apiPath}/all`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to unmap all ${config.shortName} mappings: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; unmapped: number }>;
}

export function useUnmapAllMappings(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unmapAllMappings(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

async function unmapPrinting(
  config: SourceMappingConfig,
  printingId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(config.apiPath, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printingId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to unmap printing: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useUnmapPrinting(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (printingId: string) => unmapPrinting(config, printingId),
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

async function assignToCard(
  config: SourceMappingConfig,
  override: StagingCardOverride,
): Promise<{ ok: boolean }> {
  const res = await fetch("/api/admin/staging-card-overrides", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: config.source, ...override }),
  });
  if (!res.ok) {
    throw new Error(`Failed to assign product to card: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useAssignToCard(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (override: StagingCardOverride) => assignToCard(config, override),
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

async function unassignFromCard(
  config: SourceMappingConfig,
  params: UnassignFromCard,
): Promise<{ ok: boolean }> {
  const res = await fetch("/api/admin/staging-card-overrides", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: config.source, ...params }),
  });
  if (!res.ok) {
    throw new Error(`Failed to unassign product from card: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useUnassignFromCard(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: UnassignFromCard) => unassignFromCard(config, params),
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

async function ignoreProducts(
  config: SourceMappingConfig,
  products: IgnoreProduct[],
): Promise<{ ok: boolean; ignored: number }> {
  const res = await fetch("/api/admin/ignored-products", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: config.source, products }),
  });
  if (!res.ok) {
    throw new Error(`Failed to ignore products: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; ignored: number }>;
}

export function useIgnoreProducts(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (products: IgnoreProduct[]) => ignoreProducts(config, products),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}

async function unignoreProducts(
  config: SourceMappingConfig,
  products: IgnoreProduct[],
): Promise<{ ok: boolean; unignored: number }> {
  const res = await fetch("/api/admin/ignored-products", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: config.source, products }),
  });
  if (!res.ok) {
    throw new Error(`Failed to unignore products: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; unignored: number }>;
}

export function useUnignoreProducts(config: SourceMappingConfig) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (products: IgnoreProduct[]) => unignoreProducts(config, products),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.priceMappings.bySource(config),
      });
    },
  });
}
