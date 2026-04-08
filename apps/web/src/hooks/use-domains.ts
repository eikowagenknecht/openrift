import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { AdminDomainsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDomains = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminDomainsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/domains`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Domains fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminDomainsResponse>;
  });

export const adminDomainsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.domains,
  queryFn: () => fetchDomains(),
});

export function useDomains() {
  return useSuspenseQuery(adminDomainsQueryOptions);
}

export function useCreateDomain() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label: string; color?: string | null }) => {
      const res = await client.api.v1.admin.domains.$post({ json: vars });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}

export function useUpdateDomain() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label?: string; color?: string | null }) => {
      const res = await client.api.v1.admin.domains[":slug"].$patch({
        param: { slug: vars.slug },
        json: { label: vars.label, color: vars.color },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}

export function useReorderDomains() {
  return useMutationWithInvalidation({
    mutationFn: async (slugs: string[]) => {
      const res = await client.api.v1.admin.domains.reorder.$put({ json: { slugs } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}

export function useDeleteDomain() {
  return useMutationWithInvalidation({
    mutationFn: async (slug: string) => {
      const res = await client.api.v1.admin.domains[":slug"].$delete({ param: { slug } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.domains, queryKeys.enums.all],
  });
}
