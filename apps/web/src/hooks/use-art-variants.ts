import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminArtVariantsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchArtVariants = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminArtVariantsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["art-variants"].$get(),
        "Couldn't load art variants",
      ),
  );

export const adminArtVariantsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.artVariants,
  queryFn: () => fetchArtVariants(),
});

export function useArtVariants() {
  return useSuspenseQuery(adminArtVariantsQueryOptions);
}

const createArtVariantFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["art-variants"].$post({
        json: data,
      }),
      "Couldn't create art variant",
    );
  });

export function useCreateArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createArtVariantFn({ data: vars }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const updateArtVariantFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["art-variants"][":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label },
      }),
      "Couldn't update art variant",
    );
  });

export function useUpdateArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateArtVariantFn({ data: vars }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const reorderArtVariantsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["art-variants"].reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder art variants",
    );
  });

export function useReorderArtVariants() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderArtVariantsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const deleteArtVariantFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["art-variants"][":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete art variant",
    );
  });

export function useDeleteArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteArtVariantFn({ data: { slug } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}
