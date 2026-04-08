import type { RulesListResponse, RuleVersionsListResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { API_URL } from "@/lib/server-fns/api-url";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRules = createServerFn({ method: "GET" }).handler(
  async (): Promise<RulesListResponse> => {
    const res = await fetch(`${API_URL}/api/v1/rules`);
    if (!res.ok) {
      throw new Error(`Rules fetch failed: ${res.status}`);
    }
    return res.json();
  },
);

const fetchVersions = createServerFn({ method: "GET" }).handler(
  async (): Promise<RuleVersionsListResponse> => {
    const res = await fetch(`${API_URL}/api/v1/rules/versions`);
    if (!res.ok) {
      throw new Error(`Rule versions fetch failed: ${res.status}`);
    }
    return res.json();
  },
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

export function useImportRules() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: {
      version: string;
      sourceType: string;
      sourceUrl?: string | null;
      publishedAt?: string | null;
      content: string;
    }) => {
      const res = await client.api.v1.admin.rules.import.$post({
        json: {
          version: vars.version,
          sourceType: vars.sourceType as "pdf" | "text" | "html" | "manual",
          sourceUrl: vars.sourceUrl,
          publishedAt: vars.publishedAt,
          content: vars.content,
        },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.rules.all, queryKeys.rules.versions, queryKeys.admin.rules.versions],
  });
}

export function useDeleteRuleVersion() {
  return useMutationWithInvalidation({
    mutationFn: async (version: string) => {
      const res = await client.api.v1.admin.rules.versions[":version"].$delete({
        param: { version },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.rules.all, queryKeys.rules.versions, queryKeys.admin.rules.versions],
  });
}
