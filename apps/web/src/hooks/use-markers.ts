import type { MarkerResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminMarkersResponse {
  markers: MarkerResponse[];
}

const fetchMarkers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminMarkersResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.markers.$get(),
        "Couldn't load markers",
      ),
  );

export const adminMarkersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.markers,
  queryFn: () => fetchMarkers(),
  staleTime: 30 * 60 * 1000,
});

export function useMarkers() {
  return useSuspenseQuery(adminMarkersQueryOptions);
}

const createMarkerFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.markers.$post({ json: data }),
      "Couldn't create marker",
    );
  });

export function useCreateMarker() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; description?: string | null }) =>
      createMarkerFn({ data: vars }),
    invalidates: [queryKeys.admin.markers],
  });
}

const updateMarkerFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; slug?: string; label?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.markers[":id"].$patch({
        param: encodeParams({ id: data.id }),
        json: {
          slug: data.slug,
          label: data.label,
          description: data.description,
        },
      }),
      "Couldn't update marker",
    );
  });

export function useUpdateMarker() {
  return useMutationWithInvalidation({
    mutationFn: (vars: {
      id: string;
      slug?: string;
      label?: string;
      description?: string | null;
    }) => updateMarkerFn({ data: vars }),
    invalidates: [queryKeys.admin.markers],
  });
}

const deleteMarkerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.markers[":id"].$delete({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't delete marker",
    );
  });

export function useDeleteMarker() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteMarkerFn({ data: { id } }),
    invalidates: [queryKeys.admin.markers],
  });
}

const reorderMarkersFn = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.markers.reorder.$put({
        json: { ids: data.ids },
      }),
      "Couldn't reorder markers",
    );
  });

export function useReorderMarkers() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderMarkersFn({ data: { ids } }),
    invalidates: [queryKeys.admin.markers, queryKeys.promos.all],
  });
}
