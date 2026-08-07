import type { AdminArtVariantsResponse } from "@openrift/shared/contracts/admin/art-variants";
import { adminArtVariantsContract } from "@openrift/shared/contracts/admin/art-variants";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchArtVariants = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminArtVariantsResponse> =>
    apiOrpcClient(adminArtVariantsContract, context.cookie).list(),
  );

export const adminArtVariantsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.artVariants,
  queryFn: () => fetchArtVariants(),
});

export function useArtVariants() {
  return useSuspenseQuery(adminArtVariantsQueryOptions);
}

const createArtVariantFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).create(data);
  });

export function useCreateArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string }) => createArtVariantFn({ data: vars }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const updateArtVariantFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).update(data);
  });

export function useUpdateArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateArtVariantFn({ data: vars }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const reorderArtVariantsFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderArtVariants() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderArtVariantsFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}

const deleteArtVariantFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteArtVariant() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteArtVariantFn({ data: { slug } }),
    invalidates: [queryKeys.admin.artVariants, queryKeys.init.all],
  });
}
