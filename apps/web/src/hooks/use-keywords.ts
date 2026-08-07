import type { KeywordStatsResponse } from "@openrift/shared/contracts/admin/keywords";
import { adminKeywordsContract } from "@openrift/shared/contracts/admin/keywords";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchKeywordStats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<KeywordStatsResponse> =>
    apiOrpcClient(adminKeywordsContract, context.cookie).stats(),
  );

export const keywordStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.keywordStats,
  queryFn: () => fetchKeywordStats(),
});

export function useKeywordStats() {
  return useSuspenseQuery(keywordStatsQueryOptions);
}

const recomputeKeywordsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(adminKeywordsContract, context.cookie).recompute());

export function useRecomputeKeywords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recomputeKeywordsFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
    },
  });
}

const updateKeywordStyleFn = createServerFn({ method: "POST" })
  .validator(
    (input: { name: string; color: string; darkText: boolean; costKeyword: boolean }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminKeywordsContract, context.cookie).updateStyle(data);
  });

export function useUpdateKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      color: string;
      darkText: boolean;
      costKeyword: boolean;
    }) => updateKeywordStyleFn({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

const createKeywordStyleFn = createServerFn({ method: "POST" })
  .validator(
    (input: { name: string; color: string; darkText: boolean; costKeyword: boolean }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminKeywordsContract, context.cookie).createStyle(data);
  });

export function useCreateKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      color: string;
      darkText: boolean;
      costKeyword: boolean;
    }) => createKeywordStyleFn({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

const deleteKeywordStyleFn = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminKeywordsContract, context.cookie).removeStyle({ name: data.name });
  });

export function useDeleteKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteKeywordStyleFn({ data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

// ── Translation mutations ───────────────────────────────────────────────────

const discoverTranslationsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    apiOrpcClient(adminKeywordsContract, context.cookie).discoverTranslations(),
  );

export function useDiscoverTranslations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => discoverTranslationsFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

const upsertTranslationFn = createServerFn({ method: "POST" })
  .validator((input: { keywordName: string; language: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminKeywordsContract, context.cookie).upsertTranslation(data);
  });

export function useUpsertTranslation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { keywordName: string; language: string; label: string }) =>
      upsertTranslationFn({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

const deleteTranslationFn = createServerFn({ method: "POST" })
  .validator((input: { keywordName: string; language: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminKeywordsContract, context.cookie).removeTranslation(data);
  });

export function useDeleteTranslation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { keywordName: string; language: string }) =>
      deleteTranslationFn({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}
