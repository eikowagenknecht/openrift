import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  MappingGroup,
  SourceMappingConfig,
  StagedProduct,
} from "@/components/admin/price-mappings-types";
import { API_BASE } from "@/lib/api-base";

interface MappingsResponse {
  groups: MappingGroup[];
  unmatchedProducts: StagedProduct[];
}

async function fetchMappings(
  config: SourceMappingConfig,
  showAll: boolean,
): Promise<MappingsResponse> {
  const url = showAll ? `${API_BASE}${config.apiPath}?all=true` : `${API_BASE}${config.apiPath}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${config.shortName} mappings: ${res.status}`);
  }
  return res.json() as Promise<MappingsResponse>;
}

export function usePriceMappings(config: SourceMappingConfig, showAll = false) {
  return useQuery({
    queryKey: ["admin", config.source, "mappings", { all: showAll }],
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
  const res = await fetch(`${API_BASE}${config.apiPath}`, {
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
      void queryClient.invalidateQueries({ queryKey: ["admin", config.source] });
    },
  });
}

async function unmapAllMappings(
  config: SourceMappingConfig,
): Promise<{ ok: boolean; unmapped: number }> {
  const res = await fetch(`${API_BASE}${config.apiPath}/all`, {
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
      void queryClient.invalidateQueries({ queryKey: ["admin", config.source] });
    },
  });
}

async function unmapPrinting(
  config: SourceMappingConfig,
  printingId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}${config.apiPath}`, {
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
      void queryClient.invalidateQueries({ queryKey: ["admin", config.source] });
    },
  });
}
