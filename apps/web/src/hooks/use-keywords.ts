import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

async function fetchKeywordStats() {
  const res = await client.api.v1.admin["keyword-stats"].$get();
  assertOk(res);
  return await res.json();
}

export const keywordStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.keywordStats,
  queryFn: fetchKeywordStats,
});

export function useKeywordStats() {
  return useSuspenseQuery(keywordStatsQueryOptions);
}

export function useRecomputeKeywords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await client.api.v1.admin["recompute-keywords"].$post();
      assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
    },
  });
}

export function useUpdateKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; color: string; darkText: boolean }) => {
      const res = await client.api.v1.admin["keyword-styles"][":name"].$put({
        param: { name: params.name },
        json: { color: params.color, darkText: params.darkText },
      });
      assertOk(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.keywordStyles.all });
    },
  });
}

export function useCreateKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; color: string; darkText: boolean }) => {
      const res = await client.api.v1.admin["keyword-styles"].$post({ json: params });
      assertOk(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.keywordStyles.all });
    },
  });
}

export function useDeleteKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await client.api.v1.admin["keyword-styles"][":name"].$delete({
        param: { name },
      });
      assertOk(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.keywordStyles.all });
    },
  });
}
