import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { AdminDeckZonesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckZones = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminDeckZonesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/deck-zones`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Deck zones fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminDeckZonesResponse>;
  });

export const adminDeckZonesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.deckZones,
  queryFn: () => fetchDeckZones(),
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
