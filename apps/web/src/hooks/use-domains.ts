import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const adminDomainsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.domains,
  queryFn: async () => {
    const res = await client.api.v1.admin.domains.$get();
    assertOk(res);
    return await res.json();
  },
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
