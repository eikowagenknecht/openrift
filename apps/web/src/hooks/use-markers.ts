import type { AdminMarkersResponse } from "@openrift/shared/contracts";
import { adminMarkersContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchMarkers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminMarkersResponse> =>
      apiOrpcClient(adminMarkersContract, context.cookie).list(),
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
    await apiOrpcClient(adminMarkersContract, context.cookie).create(data);
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
    await apiOrpcClient(adminMarkersContract, context.cookie).update(data);
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
    await apiOrpcClient(adminMarkersContract, context.cookie).remove({ id: data.id });
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
    await apiOrpcClient(adminMarkersContract, context.cookie).reorder({ ids: data.ids });
  });

export function useReorderMarkers() {
  return useMutationWithInvalidation({
    mutationFn: (ids: string[]) => reorderMarkersFn({ data: { ids } }),
    invalidates: [queryKeys.admin.markers, queryKeys.promos.all],
  });
}
