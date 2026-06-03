import type { RuleKind, RulesListResponse, RuleVersionsListResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRulesAtVersion = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: RuleKind; version: string }) => input)
  .handler(
    ({ data }): Promise<RulesListResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "rules", data.kind, data.version],
        queryFn: () =>
          callApiJson(
            serverApiClient().api.v1.rules.$get({
              query: { kind: data.kind, version: data.version },
            }),
            "Couldn't load rules",
          ),
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
      queryFn: () =>
        callApiJson(
          serverApiClient().api.v1.rules.versions.$get({
            query: data.kind ? { kind: data.kind } : {},
          }),
          "Couldn't load rule versions",
        ),
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
    const result = await callApiJson(
      serverApiClient(context.cookie).api.v1.admin.rules.import.$post({
        json: {
          kind: data.kind,
          version: data.version,
          comments: data.comments,
          content: data.content,
        },
      }),
      "Couldn't import rules",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.rules[":kind"].versions[":version"].$delete({
        param: encodeParams({ kind: data.kind, version: data.version }),
      }),
      "Couldn't delete rule version",
    );
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
    const result = await callApiJson(
      serverApiClient(context.cookie).api.v1.admin.rules[":kind"].versions[":version"].$patch({
        param: encodeParams({ kind: data.kind, version: data.version }),
        json: { comments: data.comments },
      }),
      "Couldn't update version comments",
    );
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
