import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export const ignoredSourcesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredSources,
  queryFn: () => rpc(client.api.admin["ignored-sources"].$get()),
});

export function useIgnoredSources() {
  return useSuspenseQuery(ignoredSourcesQueryOptions);
}

export function useIgnoreCardSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { source: string; sourceEntityId: string }) =>
      rpc(client.api.admin["ignored-sources"].cards.$post({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredSources });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cardSources.all });
    },
  });
}

export function useUnignoreCardSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { source: string; sourceEntityId: string }) =>
      rpc(client.api.admin["ignored-sources"].cards.$delete({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredSources });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cardSources.all });
    },
  });
}

export function useIgnorePrintingSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { source: string; sourceEntityId: string; finish?: string | null }) =>
      rpc(client.api.admin["ignored-sources"].printings.$post({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredSources });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cardSources.all });
    },
  });
}

export function useUnignorePrintingSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { source: string; sourceEntityId: string; finish: string | null }) =>
      rpc(client.api.admin["ignored-sources"].printings.$delete({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredSources });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.cardSources.all });
    },
  });
}
