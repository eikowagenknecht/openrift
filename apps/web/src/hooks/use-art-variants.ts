import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminArtVariantsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchArtVariants = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminArtVariantsResponse> =>
      fetchApiJson<AdminArtVariantsResponse>({
        errorTitle: "Couldn't load art variants",
        cookie: context.cookie,
        path: "/api/v1/admin/art-variants",
      }),
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
    await fetchApi({
      errorTitle: "Couldn't create art variant",
      cookie: context.cookie,
      path: "/api/v1/admin/art-variants",
      method: "POST",
      body: data,
    });
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
    await fetchApi({
      errorTitle: "Couldn't update art variant",
      cookie: context.cookie,
      path: `/api/v1/admin/art-variants/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label },
    });
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
    await fetchApi({
      errorTitle: "Couldn't reorder art variants",
      cookie: context.cookie,
      path: "/api/v1/admin/art-variants/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
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
    await fetchApi({
      errorTitle: "Couldn't delete art variant",
      cookie: context.cookie,
      path: `/api/v1/admin/art-variants/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteArtVariantFn({ data: { slug } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}
