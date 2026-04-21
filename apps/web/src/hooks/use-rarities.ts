import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminRaritiesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRarities = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminRaritiesResponse> =>
      fetchApiJson<AdminRaritiesResponse>({
        errorTitle: "Couldn't load rarities",
        cookie: context.cookie,
        path: "/api/v1/admin/rarities",
      }),
  );

export const adminRaritiesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.rarities,
  queryFn: () => fetchRarities(),
});

export function useRarities() {
  return useSuspenseQuery(adminRaritiesQueryOptions);
}

const createRarityFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create rarity",
      cookie: context.cookie,
      path: "/api/v1/admin/rarities",
      method: "POST",
      body: data,
    });
  });

export function useCreateRarity() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; color?: string | null }) =>
      createRarityFn({ data: vars }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const updateRarityFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string; color?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update rarity",
      cookie: context.cookie,
      path: `/api/v1/admin/rarities/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label, color: data.color },
    });
  });

export function useUpdateRarity() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string; color?: string | null }) =>
      updateRarityFn({ data: vars }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const reorderRaritiesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder rarities",
      cookie: context.cookie,
      path: "/api/v1/admin/rarities/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
  });

export function useReorderRarities() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderRaritiesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}

const deleteRarityFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete rarity",
      cookie: context.cookie,
      path: `/api/v1/admin/rarities/${encodeURIComponent(data.slug)}`,
      method: "DELETE",
    });
  });

export function useDeleteRarity() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteRarityFn({ data: { slug } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}
