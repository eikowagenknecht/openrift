import type { AdminMarkersResponse } from "@openrift/shared/contracts/admin/markers";
import { adminMarkersContract } from "@openrift/shared/contracts/admin/markers";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { promosKeys } from "@/features/cards/lib/cards-query-keys";
import { createAdminEnumHooks } from "@/lib/create-admin-enum-hooks";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchMarkers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminMarkersResponse> =>
    apiOrpcClient(adminMarkersContract, context.cookie).list(),
  );

const createMarkerFn = createServerFn({ method: "POST" })
  .validator((input: { slug: string; label: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMarkersContract, context.cookie).create(data);
  });

const updateMarkerFn = createServerFn({ method: "POST" })
  .validator(
    (input: { id: string; slug?: string; label?: string; description?: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMarkersContract, context.cookie).update(data);
  });

const reorderMarkersFn = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMarkersContract, context.cookie).reorder({ ids: data.ids });
  });

const deleteMarkerFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMarkersContract, context.cookie).remove({ id: data.id });
  });

const markerHooks = createAdminEnumHooks({
  queryKey: adminKeys.markers,
  list: () => fetchMarkers(),
  invalidates: [adminKeys.markers],
  staleTime: 30 * 60 * 1000,
  create: (vars: { slug: string; label: string; description?: string | null }) =>
    createMarkerFn({ data: vars }),
  update: (vars: { id: string; slug?: string; label?: string; description?: string | null }) =>
    updateMarkerFn({ data: vars }),
  reorder: (ids: string[]) => reorderMarkersFn({ data: { ids } }),
  reorderInvalidates: [adminKeys.markers, promosKeys.all],
  remove: (id: string) => deleteMarkerFn({ data: { id } }),
});

export const adminMarkersQueryOptions = markerHooks.queryOptions;
export const useMarkers = markerHooks.useList;
export const useCreateMarker = markerHooks.useCreate;
export const useUpdateMarker = markerHooks.useUpdate;
export const useDeleteMarker = markerHooks.useDelete;
export const useReorderMarkers = markerHooks.useReorder;
