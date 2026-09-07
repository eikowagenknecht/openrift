import type { AdminRaritiesResponse } from "@openrift/shared/contracts/admin/rarities";
import { adminRaritiesContract } from "@openrift/shared/contracts/admin/rarities";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { initKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchRarities = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminRaritiesResponse> =>
    apiOrpcClient(adminRaritiesContract, context.cookie).list(),
  );

const createRarityFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).create(data);
  });

const updateRarityFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).update(data);
  });

const reorderRaritiesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).reorder({ slugs: data.slugs });
  });

const deleteRarityFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).remove({ slug: data.slug });
  });

const rarityHooks = createAdminEnumHooks({
  queryKey: adminKeys.rarities,
  list: () => fetchRarities(),
  invalidates: [adminKeys.rarities, initKeys.all],
  create: (vars: { slug: string; label: string; color?: string | null }) =>
    createRarityFn({ data: vars }),
  update: (vars: { slug: string; label?: string; color?: string | null }) =>
    updateRarityFn({ data: vars }),
  reorder: (slugs: string[]) => reorderRaritiesFn({ data: { slugs } }),
  remove: (slug: string) => deleteRarityFn({ data: { slug } }),
});

export const adminRaritiesQueryOptions = rarityHooks.queryOptions;
export const useRarities = rarityHooks.useList;
export const useCreateRarity = rarityHooks.useCreate;
export const useUpdateRarity = rarityHooks.useUpdate;
export const useReorderRarities = rarityHooks.useReorder;
export const useDeleteRarity = rarityHooks.useDelete;
