import type { MarkerResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminMarkersResponse {
  markers: MarkerResponse[];
}

const fetchMarkers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminMarkersResponse> =>
      fetchApiJson<AdminMarkersResponse>({
        errorTitle: "Couldn't load markers",
        cookie: context.cookie,
        path: "/api/v1/admin/markers",
      }),
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
  .inputValidator((input: { slug: string; label: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create marker",
      cookie: context.cookie,
      path: "/api/v1/admin/markers",
      method: "POST",
      body: data,
    });
  });

export function useCreateMarker() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { slug: string; label: string; description?: string | null }) =>
      createMarkerFn({ data: vars }),
    invalidates: [queryKeys.admin.markers],
  });
}

const updateMarkerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: string; slug?: string; label?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update marker",
      cookie: context.cookie,
      path: `/api/v1/admin/markers/${encodeURIComponent(data.id)}`,
      method: "PATCH",
      body: {
        slug: data.slug,
        label: data.label,
        description: data.description,
      },
    });
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
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete marker",
      cookie: context.cookie,
      path: `/api/v1/admin/markers/${encodeURIComponent(data.id)}`,
      method: "DELETE",
    });
  });

export function useDeleteMarker() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteMarkerFn({ data: { id } }),
    invalidates: [queryKeys.admin.markers],
  });
}

const reorderMarkersFn = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder markers",
      cookie: context.cookie,
      path: "/api/v1/admin/markers/reorder",
      method: "PUT",
      body: { ids: data.ids },
    });
  });

export function useReorderMarkers() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderMarkersFn({ data: { ids } }),
    invalidates: [queryKeys.admin.markers, queryKeys.promos.all],
  });
}
