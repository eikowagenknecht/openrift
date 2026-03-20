import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export const ignoredCandidatesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredCandidates,
  queryFn: () => rpc(client.api.admin["ignored-candidates"].$get()),
});

export function useIgnoredCandidates() {
  return useSuspenseQuery(ignoredCandidatesQueryOptions);
}

export function useIgnoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string }) =>
      rpc(client.api.admin["ignored-candidates"].cards.$post({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}

export function useUnignoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string }) =>
      rpc(client.api.admin["ignored-candidates"].cards.$delete({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}

export function useIgnoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string; finish?: string | null }) =>
      rpc(client.api.admin["ignored-candidates"].printings.$post({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}

export function useUnignoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; externalId: string; finish: string | null }) =>
      rpc(client.api.admin["ignored-candidates"].printings.$delete({ json: params })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}
