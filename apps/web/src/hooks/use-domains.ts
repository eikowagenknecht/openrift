import type { AdminDomainsResponse } from "@openrift/shared/contracts/admin/domains";
import { adminDomainsContract } from "@openrift/shared/contracts/admin/domains";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDomains = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDomainsResponse> =>
      apiOrpcClient(adminDomainsContract, context.cookie).list(),
  );

export const adminDomainsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.domains,
  queryFn: () => fetchDomains(),
});

export function useDomains() {
  return useSuspenseQuery(adminDomainsQueryOptions);
}

const createDomainFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).create(data);
  });

export function useCreateDomain() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; color?: string | null }) =>
      createDomainFn({ data: vars }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}

const updateDomainFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).update(data);
  });

export function useUpdateDomain() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string; color?: string | null }) =>
      updateDomainFn({ data: vars }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}

const reorderDomainsFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderDomains() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDomainsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}

const deleteDomainFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteDomain() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteDomainFn({ data: { slug } }),
    invalidates: [queryKeys.admin.domains, queryKeys.init.all],
  });
}
