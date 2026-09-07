import type { AdminDomainsResponse } from "@openrift/shared/contracts/admin/domains";
import { adminDomainsContract } from "@openrift/shared/contracts/admin/domains";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { initKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchDomains = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminDomainsResponse> =>
    apiOrpcClient(adminDomainsContract, context.cookie).list(),
  );

const createDomainFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).create(data);
  });

const updateDomainFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).update(data);
  });

const reorderDomainsFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteDomainFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminDomainsContract, context.cookie).remove({ slug: data.slug });
  });

const domainHooks = createAdminEnumHooks({
  queryKey: adminKeys.domains,
  list: () => fetchDomains(),
  invalidates: [adminKeys.domains, initKeys.all],
  create: (vars: { slug: string; label: string; color?: string | null }) =>
    createDomainFn({ data: vars }),
  update: (vars: { slug: string; label?: string; color?: string | null }) =>
    updateDomainFn({ data: vars }),
  reorder: (slugs: string[]) => reorderDomainsFn({ data: { slugs } }),
  remove: (slug: string) => deleteDomainFn({ data: { slug } }),
});

export const adminDomainsQueryOptions = domainHooks.queryOptions;
export const useDomains = domainHooks.useList;
export const useCreateDomain = domainHooks.useCreate;
export const useUpdateDomain = domainHooks.useUpdate;
export const useReorderDomains = domainHooks.useReorder;
export const useDeleteDomain = domainHooks.useDelete;
