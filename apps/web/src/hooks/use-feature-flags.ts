import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
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
    queryFn: () => rpc<{ flags: FeatureFlag[] }>(client.api.admin["feature-flags"].$get()),
  });
}

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; enabled: boolean }) =>
      rpc<{ ok: boolean }>(
        client.api.admin["feature-flags"][":key"].$patch({
          param: { key: vars.key },
          json: { enabled: vars.enabled },
        }),
      ),
    invalidates: [queryKeys.admin.featureFlags],
  });
}

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; description?: string | null; enabled?: boolean }) =>
      rpc<{ ok: boolean }>(client.api.admin["feature-flags"].$post({ json: vars })),
    invalidates: [queryKeys.admin.featureFlags],
  });
}

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (key: string) =>
      rpc<{ ok: boolean }>(client.api.admin["feature-flags"][":key"].$delete({ param: { key } })),
    invalidates: [queryKeys.admin.featureFlags],
  });
}
