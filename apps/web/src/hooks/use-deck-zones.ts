import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
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

const reorderDeckZonesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/deck-zones/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ slugs: data.slugs }),
    });
    if (!res.ok) {
      throw new Error(`Reorder deck zones failed: ${res.status}`);
    }
  });

export function useReorderDeckZones() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDeckZonesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.deckZones, queryKeys.enums.all],
  });
}

const updateDeckZoneFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/deck-zones/${encodeURIComponent(data.slug)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: data.label }),
    });
    if (!res.ok) {
      throw new Error(`Update deck zone failed: ${res.status}`);
    }
  });

export function useUpdateDeckZone() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateDeckZoneFn({ data: vars }),
    invalidates: [queryKeys.admin.deckZones, queryKeys.enums.all],
  });
}
