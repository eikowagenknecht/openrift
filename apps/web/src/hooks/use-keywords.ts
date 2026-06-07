import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { KeywordStatsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchKeywordStats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<KeywordStatsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["keyword-stats"].$get(),
        "Couldn't load keyword stats",
      ),
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
    callApiJson(
      serverApiClient(context.cookie).api.admin.v1["recompute-keywords"].$post(),
      "Couldn't recompute keywords",
    ),
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
  .validator((input: { name: string; color: string; darkText: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.keywords[":name"].$put({
        param: encodeParams({ name: data.name }),
        json: { color: data.color, darkText: data.darkText },
      }),
      "Couldn't update keyword style",
    );
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
  .validator((input: { name: string; color: string; darkText: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.keywords.$post({
        json: data,
      }),
      "Couldn't create keyword style",
    );
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
  .validator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.keywords[":name"].$delete({
        param: encodeParams({ name: data.name }),
      }),
      "Couldn't delete keyword style",
    );
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
    callApiJson(
      serverApiClient(context.cookie).api.admin.v1["discover-keyword-translations"].$post(),
      "Couldn't discover translations",
    ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["keyword-translations"][":keywordName"][
        ":language"
      ].$put({
        param: encodeParams({ keywordName: data.keywordName, language: data.language }),
        json: { label: data.label },
      }),
      "Couldn't upsert translation",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["keyword-translations"][":keywordName"][
        ":language"
      ].$delete({
        param: encodeParams({ keywordName: data.keywordName, language: data.language }),
      }),
      "Couldn't delete translation",
    );
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
