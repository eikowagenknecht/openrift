import type { RulesListResponse, RuleVersionsListResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
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
    const res = await fetch(`${API_URL}/api/v1/admin/rules/import`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        version: data.version,
        sourceType: data.sourceType as "pdf" | "text" | "html" | "manual",
        sourceUrl: data.sourceUrl,
        publishedAt: data.publishedAt,
        content: data.content,
      }),
    });
    if (!res.ok) {
      throw new Error(`Import rules failed: ${res.status}`);
    }
    return res.json();
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/rules/versions/${encodeURIComponent(version)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie },
      },
    );
    if (!res.ok) {
      throw new Error(`Delete rule version failed: ${res.status}`);
    }
  });

export function useDeleteRuleVersion() {
  return useMutationWithInvalidation({
    mutationFn: (version: string) => deleteRuleVersionFn({ data: version }),
    invalidates: [queryKeys.rules.all, queryKeys.rules.versions, queryKeys.admin.rules.versions],
  });
}
