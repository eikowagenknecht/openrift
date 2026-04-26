import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { KeywordStatsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchKeywordStats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<KeywordStatsResponse> =>
      fetchApiJson<KeywordStatsResponse>({
        errorTitle: "Couldn't load keyword stats",
        cookie: context.cookie,
        path: "/api/v1/admin/keyword-stats",
      }),
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
  .handler(({ context }) =>
    fetchApiJson<{ updated: number; totalCards: number }>({
      errorTitle: "Couldn't recompute keywords",
      cookie: context.cookie,
      path: "/api/v1/admin/recompute-keywords",
      method: "POST",
    }),
  );

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
  .inputValidator((input: { name: string; color: string; darkText: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update keyword style",
      cookie: context.cookie,
      path: `/api/v1/admin/keywords/${encodeURIComponent(data.name)}`,
      method: "PUT",
      body: { color: data.color, darkText: data.darkText },
    });
  });

export function useUpdateKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; color: string; darkText: boolean }) =>
      updateKeywordStyleFn({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

const createKeywordStyleFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; color: string; darkText: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create keyword style",
      cookie: context.cookie,
      path: "/api/v1/admin/keywords",
      method: "POST",
      body: data,
    });
  });

export function useCreateKeywordStyle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; color: string; darkText: boolean }) =>
      createKeywordStyleFn({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.keywordStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.init.all });
    },
  });
}

const deleteKeywordStyleFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete keyword style",
      cookie: context.cookie,
      path: `/api/v1/admin/keywords/${encodeURIComponent(data.name)}`,
      method: "DELETE",
    });
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
    fetchApiJson<{
      candidatesExamined: number;
      discovered: { keyword: string; language: string; label: string }[];
      inserted: number;
      conflicts: { keyword: string; language: string; labels: string[] }[];
    }>({
      errorTitle: "Couldn't discover translations",
      cookie: context.cookie,
      path: "/api/v1/admin/discover-keyword-translations",
      method: "POST",
    }),
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
  .inputValidator((input: { keywordName: string; language: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't upsert translation",
      cookie: context.cookie,
      path: `/api/v1/admin/keyword-translations/${encodeURIComponent(data.keywordName)}/${encodeURIComponent(data.language)}`,
      method: "PUT",
      body: { label: data.label },
    });
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
  .inputValidator((input: { keywordName: string; language: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete translation",
      cookie: context.cookie,
      path: `/api/v1/admin/keyword-translations/${encodeURIComponent(data.keywordName)}/${encodeURIComponent(data.language)}`,
      method: "DELETE",
    });
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
