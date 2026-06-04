import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminRaritiesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchRarities = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminRaritiesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.rarities.$get(),
        "Couldn't load rarities",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.rarities.$post({
        json: data,
      }),
      "Couldn't create rarity",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.rarities[":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label, color: data.color },
      }),
      "Couldn't update rarity",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.rarities.reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder rarities",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.rarities[":slug"].$delete({
        param: encodeParams({ slug: data.slug }),
      }),
      "Couldn't delete rarity",
    );
  });

export function useDeleteRarity() {
  return useMutationWithInvalidation({
    mutationFn: (slug: string) => deleteRarityFn({ data: { slug } }),
    invalidates: [queryKeys.admin.rarities, queryKeys.init.all],
  });
}
