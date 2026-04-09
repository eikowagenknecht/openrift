import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { KeywordStatsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchKeywordStats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<KeywordStatsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/keyword-stats`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Keyword stats fetch failed: ${res.status}`);
    }
    return res.json() as Promise<KeywordStatsResponse>;
  });

export const keywordStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.keywordStats,
  queryFn: () => fetchKeywordStats(),
});

export function useKeywordStats() {
  return useSuspenseQuery(keywordStatsQueryOptions);
}

const recomputeKeywordsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/recompute-keywords`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Recompute keywords failed: ${res.status}`);
    }
    return res.json();
  });

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
    const res = await fetch(
      `${API_URL}/api/v1/admin/keyword-styles/${encodeURIComponent(data.name)}`,
      {
        method: "PUT",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ color: data.color, darkText: data.darkText }),
      },
    );
    if (!res.ok) {
      throw new Error(`Update keyword style failed: ${res.status}`);
    }
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
    const res = await fetch(`${API_URL}/api/v1/admin/keyword-styles`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create keyword style failed: ${res.status}`);
    }
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/keyword-styles/${encodeURIComponent(data.name)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete keyword style failed: ${res.status}`);
    }
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
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/discover-keyword-translations`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Discover translations failed: ${res.status}`);
    }
    return res.json() as Promise<{
      candidatesExamined: number;
      discovered: { keyword: string; language: string; label: string }[];
      inserted: number;
      conflicts: { keyword: string; language: string; labels: string[] }[];
    }>;
  });

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
    const res = await fetch(
      `${API_URL}/api/v1/admin/keyword-translations/${encodeURIComponent(data.keywordName)}/${encodeURIComponent(data.language)}`,
      {
        method: "PUT",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ label: data.label }),
      },
    );
    if (!res.ok) {
      throw new Error(`Upsert translation failed: ${res.status}`);
    }
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/keyword-translations/${encodeURIComponent(data.keywordName)}/${encodeURIComponent(data.language)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete translation failed: ${res.status}`);
    }
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
