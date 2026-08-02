import type { AdminRaritiesResponse } from "@openrift/shared/contracts/admin/rarities";
import { adminRaritiesContract } from "@openrift/shared/contracts/admin/rarities";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRarities = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminRaritiesResponse> =>
      apiOrpcClient(adminRaritiesContract, context.cookie).list(),
  );

export const adminRaritiesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.rarities,
  queryFn: () => fetchRarities(),
});

export function useRarities() {
  return useSuspenseQuery(adminRaritiesQueryOptions);
}

const createRarityFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).create(data);
  });

export function useCreateRarity() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; color?: string | null }) =>
      createRarityFn({ data: vars }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const updateRarityFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).update(data);
  });

export function useUpdateRarity() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string; color?: string | null }) =>
      updateRarityFn({ data: vars }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const reorderRaritiesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).reorder({ slugs: data.slugs });
  });

export function useReorderRarities() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderRaritiesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const deleteRarityFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminRaritiesContract, context.cookie).remove({ slug: data.slug });
  });

export function useDeleteRarity() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteRarityFn({ data: { slug } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}
