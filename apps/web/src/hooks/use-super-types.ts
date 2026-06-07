import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminSuperTypesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchSuperTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSuperTypesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["super-types"].$get(),
        "Couldn't load super types",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["super-types"].$post({
        json: data,
      }),
      "Couldn't create super type",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["super-types"][":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label },
      }),
      "Couldn't update super type",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["super-types"].reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder super types",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["super-types"][":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete super type",
    );
  });

export function useDeleteSuperType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteSuperTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.superTypes, queryKeys.init.all],
  });
}
