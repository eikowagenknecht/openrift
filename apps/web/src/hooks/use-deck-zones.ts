import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminDeckZonesResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckZones = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminDeckZonesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["deck-zones"].$get(),
        "Couldn't load deck zones",
      ),
  );

export const adminDeckZonesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.deckZones,
  queryFn: () => fetchDeckZones(),
});

export function useDeckZones() {
  return useSuspenseQuery(adminDeckZonesQueryOptions);
}

const reorderDeckZonesFn = createServerFn({ method: "POST" })
  .validator((input: { slugs: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["deck-zones"].reorder.$put({
        json: { slugs: data.slugs },
      }),
      "Couldn't reorder deck zones",
    );
  });

export function useReorderDeckZones() {
  return useMutationWithInvalidation({
    mutationFn: (slugs: string[]) => reorderDeckZonesFn({ data: { slugs } }),
    invalidates: [queryKeys.admin.deckZones, queryKeys.init.all],
  });
}

const updateDeckZoneFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["deck-zones"][":slug"].$patch({
        param: encodeParams({ slug: data.slug }),
        json: { label: data.label },
      }),
      "Couldn't update deck zone",
    );
  });

export function useUpdateDeckZone() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label?: string }) => updateDeckZoneFn({ data: vars }),
    invalidates: [queryKeys.admin.deckZones, queryKeys.init.all],
  });
}
