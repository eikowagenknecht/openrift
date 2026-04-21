import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminDeckZonesResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckZones = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDeckZonesResponse> =>
      fetchApiJson<AdminDeckZonesResponse>({
        errorTitle: "Couldn't load deck zones",
        cookie: context.cookie,
        path: "/api/v1/admin/deck-zones",
      }),
  );

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
    await fetchApi({
      errorTitle: "Couldn't reorder deck zones",
      cookie: context.cookie,
      path: "/api/v1/admin/deck-zones/reorder",
      method: "PUT",
      body: { slugs: data.slugs },
    });
  });

export function useReorderDeckZones() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDeckZonesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.deckZones, queryKeys.init.all],
  });
}

const updateDeckZoneFn = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update deck zone",
      cookie: context.cookie,
      path: `/api/v1/admin/deck-zones/${encodeURIComponent(data.slug)}`,
      method: "PATCH",
      body: { label: data.label },
    });
  });

export function useUpdateDeckZone() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateDeckZoneFn({ data: vars }),
    invalidates: [queryKeys.admin.deckZones, queryKeys.init.all],
  });
}
