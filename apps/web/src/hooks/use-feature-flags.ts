import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.admin.featureFlags,
    queryFn: () => api.get<{ flags: FeatureFlag[] }>("/api/admin/feature-flags"),
  });
}

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; enabled: boolean }) =>
      api.patch<{ ok: boolean }>(`/api/admin/feature-flags/${encodeURIComponent(vars.key)}`, {
        enabled: vars.enabled,
      }),
    invalidates: [queryKeys.admin.featureFlags],
  });
}

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; description?: string | null; enabled?: boolean }) =>
      api.post<{ ok: boolean }>("/api/admin/feature-flags", vars),
    invalidates: [queryKeys.admin.featureFlags],
  });
}

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (key: string) =>
      api.del<{ ok: boolean }>(`/api/admin/feature-flags/${encodeURIComponent(key)}`),
    invalidates: [queryKeys.admin.featureFlags],
  });
}
