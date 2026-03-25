import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export const ignoredCandidatesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.ignoredCandidates,
  queryFn: async () => {
    const res = await client.api.v1.admin["ignored-candidates"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useIgnoredCandidates() {
  return useSuspenseQuery(ignoredCandidatesQueryOptions);
}

export function useIgnoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { provider: string; externalId: string }) => {
      const res = await client.api.v1.admin["ignored-candidates"].cards.$post({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}

export function useUnignoreCandidateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { provider: string; externalId: string }) => {
      const res = await client.api.v1.admin["ignored-candidates"].cards.$delete({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}

export function useIgnoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      provider: string;
      externalId: string;
      finish?: string | null;
    }) => {
      const res = await client.api.v1.admin["ignored-candidates"].printings.$post({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}

export function useUnignoreCandidatePrinting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { provider: string; externalId: string; finish: string | null }) => {
      const res = await client.api.v1.admin["ignored-candidates"].printings.$delete({
        json: params,
      });
      assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ignoredCandidates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.candidates.all });
    },
  });
}
