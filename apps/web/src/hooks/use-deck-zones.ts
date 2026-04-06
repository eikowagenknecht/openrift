import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const adminDeckZonesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.deckZones,
  queryFn: async () => {
    const res = await client.api.v1.admin["deck-zones"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useDeckZones() {
  return useSuspenseQuery(adminDeckZonesQueryOptions);
}

export function useReorderDeckZones() {
  return useMutationWithInvalidation({
    mutationFn: async (slugs: string[]) => {
      const res = await client.api.v1.admin["deck-zones"].reorder.$put({ json: { slugs } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.deckZones, queryKeys.enums.all],
  });
}

export function useUpdateDeckZone() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { slug: string; label?: string }) => {
      const res = await client.api.v1.admin["deck-zones"][":slug"].$patch({
        param: { slug: vars.slug },
        json: { label: vars.label },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.deckZones, queryKeys.enums.all],
  });
}
