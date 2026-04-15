import type { MarkerResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface AdminMarkersResponse {
  markers: MarkerResponse[];
}

const fetchMarkers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminMarkersResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/markers`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Markers fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminMarkersResponse>;
  });

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
    const res = await fetch(`${API_URL}/api/v1/admin/markers`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create marker failed: ${res.status}`);
    }
    return res.json();
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
    const res = await fetch(`${API_URL}/api/v1/admin/markers/${encodeURIComponent(data.id)}`, {
      method: "PATCH",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        slug: data.slug,
        label: data.label,
        description: data.description,
      }),
    });
    if (!res.ok) {
      throw new Error(`Update marker failed: ${res.status}`);
    }
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
    const res = await fetch(`${API_URL}/api/v1/admin/markers/${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete marker failed: ${res.status}`);
    }
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
    const res = await fetch(`${API_URL}/api/v1/admin/markers/reorder`, {
      method: "PUT",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ ids: data.ids }),
    });
    if (!res.ok) {
      throw new Error(`Reorder markers failed: ${res.status}`);
    }
  });

export function useReorderMarkers() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderMarkersFn({ data: { ids } }),
    invalidates: [queryKeys.admin.markers, queryKeys.promos.all],
  });
}
