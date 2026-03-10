import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchFeatureFlags(): Promise<{ flags: FeatureFlag[] }> {
  const res = await fetch("/api/admin/feature-flags", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch feature flags: ${res.status}`);
  }
  return res.json() as Promise<{ flags: FeatureFlag[] }>;
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.admin.featureFlags,
    queryFn: fetchFeatureFlags,
  });
}

async function toggleFlag(vars: { key: string; enabled: boolean }): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/feature-flags/${encodeURIComponent(vars.key)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: vars.enabled }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update flag: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: toggleFlag,
    invalidates: [queryKeys.admin.featureFlags],
  });
}

interface CreateFlagVars {
  key: string;
  description?: string | null;
  enabled?: boolean;
}

async function createFlag(vars: CreateFlagVars): Promise<{ ok: boolean }> {
  const res = await fetch("/api/admin/feature-flags", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error: string };
    throw new Error(data.error || `Failed to create flag: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: createFlag,
    invalidates: [queryKeys.admin.featureFlags],
  });
}

async function deleteFlag(key: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete flag: ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: deleteFlag,
    invalidates: [queryKeys.admin.featureFlags],
  });
}
