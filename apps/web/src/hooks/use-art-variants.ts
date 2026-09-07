import type { AdminArtVariantsResponse } from "@openrift/shared/contracts/admin/art-variants";
import { adminArtVariantsContract } from "@openrift/shared/contracts/admin/art-variants";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { initKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchArtVariants = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminArtVariantsResponse> =>
    apiOrpcClient(adminArtVariantsContract, context.cookie).list(),
  );

const createArtVariantFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).create(data);
  });

const updateArtVariantFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).update(data);
  });

const reorderArtVariantsFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteArtVariantFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminArtVariantsContract, context.cookie).remove({ slug: data.slug });
  });

const artVariantHooks = createAdminEnumHooks({
  queryKey: adminKeys.artVariants,
  list: () => fetchArtVariants(),
  invalidates: [adminKeys.artVariants, initKeys.all],
  create: (vars: { slug: string; label: string }) => createArtVariantFn({ data: vars }),
  update: (vars: { slug: string; label?: string }) => updateArtVariantFn({ data: vars }),
  reorder: (slugs: string[]) => reorderArtVariantsFn({ data: { slugs } }),
  remove: (slug: string) => deleteArtVariantFn({ data: { slug } }),
});

export const adminArtVariantsQueryOptions = artVariantHooks.queryOptions;
export const useArtVariants = artVariantHooks.useList;
export const useCreateArtVariant = artVariantHooks.useCreate;
export const useUpdateArtVariant = artVariantHooks.useUpdate;
export const useReorderArtVariants = artVariantHooks.useReorder;
export const useDeleteArtVariant = artVariantHooks.useDelete;
