import type { RuleKind, RulesListResponse, RuleVersionsListResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRulesAtVersion = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: RuleKind; version: string }) => input)
  .handler(
    ({ data }): Promise<RulesListResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "rules", data.kind, data.version],
        queryFn: () => {
          const params = new URLSearchParams({ kind: data.kind, version: data.version });
          return fetchApiJson<RulesListResponse>({
            errorTitle: "Couldn't load rules",
            path: `/api/v1/rules?${params.toString()}`,
          });
        },
      }),
  );

const fetchVersions = createServerFn({ method: "GET" })
  .inputValidator((input: { kind?: RuleKind } | undefined) => input ?? {})
  .handler(({ data }): Promise<RuleVersionsListResponse> => {
    const cacheKey = data.kind
      ? ["server-cache", "rules-versions", data.kind]
      : ["server-cache", "rules-versions"];
    return serverCache.fetchQuery({
      queryKey: cacheKey,
      queryFn: () => {
        const path = data.kind
          ? `/api/v1/rules/versions?kind=${encodeURIComponent(data.kind)}`
          : "/api/v1/rules/versions";
        return fetchApiJson<RuleVersionsListResponse>({
          errorTitle: "Couldn't load rule versions",
          path,
        });
      },
    });
  });

export function rulesAtVersionQueryOptions(kind: RuleKind, version: string) {
  return queryOptions({
    queryKey: queryKeys.rules.byVersion(kind, version),
    queryFn: () => fetchRulesAtVersion({ data: { kind, version } }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function ruleVersionsQueryOptions(kind?: RuleKind) {
  return queryOptions({
    queryKey: kind ? queryKeys.rules.versions(kind) : (["rules", "versions", "all"] as const),
    queryFn: () => fetchVersions({ data: kind ? { kind } : undefined }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRulesAtVersion(kind: RuleKind, version: string) {
  return useSuspenseQuery(rulesAtVersionQueryOptions(kind, version));
}

export function useRuleVersions(kind?: RuleKind) {
  return useSuspenseQuery(ruleVersionsQueryOptions(kind));
}

const importRulesFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { kind: RuleKind; version: string; comments?: string | null; content: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const result = await fetchApiJson<{
      kind: RuleKind;
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
        kind: data.kind,
        version: data.version,
        comments: data.comments,
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
      kind: RuleKind;
      version: string;
      comments?: string | null;
      content: string;
    }) => importRulesFn({ data: vars }),
    invalidates: [["rules"], queryKeys.admin.rules.versions],
  });
}

const deleteRuleVersionFn = createServerFn({ method: "POST" })
  .inputValidator((input: { kind: RuleKind; version: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete rule version",
      cookie: context.cookie,
      path: `/api/v1/admin/rules/${encodeURIComponent(data.kind)}/versions/${encodeURIComponent(
        data.version,
      )}`,
      method: "DELETE",
    });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules"] });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules-versions"] });
  });

export function useDeleteRuleVersion() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { kind: RuleKind; version: string }) => deleteRuleVersionFn({ data: vars }),
    invalidates: [["rules"], queryKeys.admin.rules.versions],
  });
}

const updateRuleVersionCommentsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { kind: RuleKind; version: string; comments: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const result = await fetchApiJson<{
      kind: RuleKind;
      version: string;
      comments: string | null;
    }>({
      errorTitle: "Couldn't update version comments",
      cookie: context.cookie,
      path: `/api/v1/admin/rules/${encodeURIComponent(data.kind)}/versions/${encodeURIComponent(
        data.version,
      )}`,
      method: "PATCH",
      body: { comments: data.comments },
    });
    await serverCache.invalidateQueries({ queryKey: ["server-cache", "rules-versions"] });
    return result;
  });

export function useUpdateRuleVersionComments() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { kind: RuleKind; version: string; comments: string | null }) =>
      updateRuleVersionCommentsFn({ data: vars }),
    invalidates: [["rules"], queryKeys.admin.rules.versions],
  });
}
