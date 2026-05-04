import type { RulesListResponse, RuleVersionsListResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRules = createServerFn({ method: "GET" }).handler(
  (): Promise<RulesListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "rules"],
      queryFn: () =>
        fetchApiJson<RulesListResponse>({
          errorTitle: "Couldn't load rules",
          path: "/api/v1/rules",
        }),
    }),
);

const fetchVersions = createServerFn({ method: "GET" }).handler(
  (): Promise<RuleVersionsListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "rules-versions"],
      queryFn: () =>
        fetchApiJson<RuleVersionsListResponse>({
          errorTitle: "Couldn't load rule versions",
          path: "/api/v1/rules/versions",
        }),
    }),
);

export const rulesQueryOptions = queryOptions({
  queryKey: queryKeys.rules.all,
  queryFn: () => fetchRules(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const ruleVersionsQueryOptions = queryOptions({
  queryKey: queryKeys.rules.versions,
  queryFn: () => fetchVersions(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export function useRules() {
  return useSuspenseQuery(rulesQueryOptions);
}

export function useRuleVersions() {
  return useSuspenseQuery(ruleVersionsQueryOptions);
}

const importRulesFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      version: string;
      sourceType: string;
      sourceUrl?: string | null;
      publishedAt?: string | null;
      content: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const result = await fetchApiJson<{
      version: string;
      rulesCount: number;
      added: number;
      modified: number;
      removed: number;
    }>({
      errorTitle: "Couldn't import rules",
      cookie: context.cookie,
      path: "/api/v1/admin/rules/import",
      method: "POST",
      body: {
        version: data.version,
        sourceType: data.sourceType as "pdf" | "text" | "html" | "manual",
        sourceUrl: data.sourceUrl,
        publishedAt: data.publishedAt,
        content: data.content,
      },
    });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules"] });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules-versions"] });
    return result;
  });

export function useImportRules() {
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      version: string;
      sourceType: string;
      sourceUrl?: string | null;
      publishedAt?: string | null;
      content: string;
    }) => importRulesFn({ data: vars }),
    invalidates: [queryKeys.rules.all, queryKeys.rules.versions, queryKeys.admin.rules.versions],
  });
}

const deleteRuleVersionFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: version }) => {
    await fetchApi({
      errorTitle: "Couldn't delete rule version",
      cookie: context.cookie,
      path: `/api/v1/admin/rules/versions/${encodeURIComponent(version)}`,
      method: "DELETE",
    });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules"] });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules-versions"] });
  });

export function useDeleteRuleVersion() {
  return useMutationWithInvalidation({
    mutationFn: (version: string) => deleteRuleVersionFn({ data: version }),
    invalidates: [queryKeys.rules.all, queryKeys.rules.versions, queryKeys.admin.rules.versions],
  });
}
