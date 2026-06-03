import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminCardTypesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCardTypes = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminCardTypesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["card-types"].$get(),
        "Couldn't load card types",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["card-types"].$post({
        json: data,
      }),
      "Couldn't create card type",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["card-types"][":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label },
      }),
      "Couldn't update card type",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["card-types"].reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder card types",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin["card-types"][":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete card type",
    );
  });

export function useDeleteCardType() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteCardTypeFn({ data: { slug } }),
    invalidates: [queryKeys.admin.cardTypes, queryKeys.init.all],
  });
}
