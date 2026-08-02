import type { AdminSuperTypesResponse } from "@openrift/shared/contracts/admin/super-types";
import { adminSuperTypesContract } from "@openrift/shared/contracts/admin/super-types";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSuperTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSuperTypesResponse> =>
      apiOrpcClient(adminSuperTypesContract, context.cookie).list(),
  );

export const adminSuperTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.superTypes,
  queryFn: () => fetchSuperTypes(),
});

export function useSuperTypes() {
  return useSuspenseQuery(adminSuperTypesQueryOptions);
}

const createSuperTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).create(data);
  });

export function useCreateSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createSuperTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const updateSuperTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).update(data);
  });

export function useUpdateSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateSuperTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const reorderSuperTypesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderSuperTypes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderSuperTypesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const deleteSuperTypeFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSuperTypesContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteSuperTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}
