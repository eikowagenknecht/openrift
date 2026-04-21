import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminCardTypesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCardTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminCardTypesResponse> =>
      fetchApiJson<AdminCardTypesResponse>({
        errorTitle: "Couldn't load card types",
        cookie: context.cookie,
        path: "/api/v1/admin/card-types",
      }),
  );

export const adminCardTypesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cardTypes,
  queryFn: () => fetchCardTypes(),
});

export function useCardTypes() {
  return useSuspenseQuery(adminCardTypesQueryOptions);
}

const createCardTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create card type",
      cookie: context.cookie,
      path: "/api/v1/admin/card-types",
      method: "POST",
      body: data,
    });
  });

export function useCreateCardType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createCardTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const updateCardTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update card type",
      cookie: context.cookie,
      path: `/api/v1/admin/card-types/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label },
    });
  });

export function useUpdateCardType() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateCardTypeFn({ data: vars }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const reorderCardTypesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder card types",
      cookie: context.cookie,
      path: "/api/v1/admin/card-types/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
  });

export function useReorderCardTypes() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderCardTypesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}

const deleteCardTypeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete card type",
      cookie: context.cookie,
      path: `/api/v1/admin/card-types/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteCardType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteCardTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}
