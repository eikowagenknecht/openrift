import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminSuperTypesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSuperTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSuperTypesResponse> =>
      fetchApiJson<AdminSuperTypesResponse>({
        errorTitle: "Couldn't load super types",
        cookie: context.cookie,
        path: "/api/v1/admin/super-types",
      }),
  );

export const adminSuperTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.superTypes,
  queryFn: () => fetchSuperTypes(),
});

export function useSuperTypes() {
  return useSuspenseQuery(adminSuperTypesQueryOptions);
}

const createSuperTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create super type",
      cookie: context.cookie,
      path: "/api/v1/admin/super-types",
      method: "POST",
      body: data,
    });
  });

export function useCreateSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createSuperTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const updateSuperTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update super type",
      cookie: context.cookie,
      path: `/api/v1/admin/super-types/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label },
    });
  });

export function useUpdateSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateSuperTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const reorderSuperTypesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder super types",
      cookie: context.cookie,
      path: "/api/v1/admin/super-types/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
  });

export function useReorderSuperTypes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderSuperTypesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}

const deleteSuperTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete super type",
      cookie: context.cookie,
      path: `/api/v1/admin/super-types/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteSuperTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}
