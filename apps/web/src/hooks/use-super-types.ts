import type { AdminSuperTypesResponse } from "@openrift/shared/contracts/admin/super-types";
import { adminSuperTypesContract } from "@openrift/shared/contracts/admin/super-types";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { initKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchSuperTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminSuperTypesResponse> =>
    apiOrpcClient(adminSuperTypesContract, context.cookie).list(),
  );

const createSuperTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).create(data);
  });

const updateSuperTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).update(data);
  });

const reorderSuperTypesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteSuperTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).remove({ slug: data.slug });
  });

const superTypeHooks = createAdminEnumHooks({
  queryKey: adminKeys.superTypes,
  list: () => fetchSuperTypes(),
  invalidates: [adminKeys.superTypes, initKeys.all],
  create: (vars: { slug: string; label: string }) => createSuperTypeFn({ data: vars }),
  update: (vars: { slug: string; label?: string }) => updateSuperTypeFn({ data: vars }),
  reorder: (slugs: string[]) => reorderSuperTypesFn({ data: { slugs } }),
  remove: (slug: string) => deleteSuperTypeFn({ data: { slug } }),
});

export const adminSuperTypesQueryOptions = superTypeHooks.queryOptions;
export const useSuperTypes = superTypeHooks.useList;
export const useCreateSuperType = superTypeHooks.useCreate;
export const useUpdateSuperType = superTypeHooks.useUpdate;
export const useReorderSuperTypes = superTypeHooks.useReorder;
export const useDeleteSuperType = superTypeHooks.useDelete;
