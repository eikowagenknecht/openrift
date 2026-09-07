import type {
  MetaCatalogSort,
  MetaCatalogSortDirection,
  MetaCatalogTriage,
  MetaSyncTriggerResult,
  PlayloltcgCatalogListResponse,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { adminMetaCatalogContract } from "@openrift/shared/contracts/admin/meta-catalog";
import type { PlayloltcgStatus } from "@openrift/shared/types/enums";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { metaKeys } from "@/features/meta/lib/meta-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface PlayloltcgCatalogParams {
  page?: number;
  search?: string;
  triage?: MetaCatalogTriage;
  status?: PlayloltcgStatus;
  minPlayers?: number;
  dateFrom?: string;
  dateTo?: string;
  missing?: boolean;
  awaitingResults?: boolean;
  sort?: MetaCatalogSort;
  direction?: MetaCatalogSortDirection;
}

export const PLAYLOLTCG_CATALOG_PAGE_SIZE = 50;

const fetchPlayloltcgCatalog = createServerFn({ method: "GET" })
  .validator((input: PlayloltcgCatalogParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PlayloltcgCatalogListResponse> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).playloltcgList({
      page: data.page,
      limit: PLAYLOLTCG_CATALOG_PAGE_SIZE,
      search: data.search,
      triage: data.triage,
      status: data.status,
      minPlayers: data.minPlayers,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      sort: data.sort,
      direction: data.direction,
      // Query strings coerce "false" to true; an off toggle must be absent, never false.
      missing: data.missing === true ? true : undefined,
      awaitingResults: data.awaitingResults === true ? true : undefined,
    }),
  );

export function useAdminPlayloltcgCatalog(params: PlayloltcgCatalogParams) {
  return useQuery(
    queryOptions({
      queryKey: adminKeys.meta.playloltcgCatalogueList(params),
      queryFn: () => fetchPlayloltcgCatalog({ data: params }),
      placeholderData: keepPreviousData,
    }),
  );
}

const acceptFn = createServerFn({ method: "POST" })
  .validator((input: { activityShopId: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).playloltcgAccept(data),
  );

const acceptInvalidates = [
  adminKeys.meta.playloltcgCatalogue,
  adminKeys.meta.syncStatus.prefix,
  adminKeys.meta.events,
  adminKeys.meta.overlays,
  metaKeys.all,
] as const;

export function useAcceptPlayloltcgEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { activityShopId: number }) => acceptFn({ data: vars }),
    invalidates: acceptInvalidates,
  });
}

const dismissFn = createServerFn({ method: "POST" })
  .validator((input: { activityShopId: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).playloltcgDismiss(data);
  });

const dismissInvalidates = [
  adminKeys.meta.playloltcgCatalogue,
  adminKeys.meta.syncStatus.prefix,
] as const;

export function useDismissPlayloltcgEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { activityShopId: number }) => dismissFn({ data: vars }),
    invalidates: dismissInvalidates,
  });
}

const undismissFn = createServerFn({ method: "POST" })
  .validator((input: { activityShopId: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).playloltcgUndismiss(data);
  });

export function useUndismissPlayloltcgEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { activityShopId: number }) => undismissFn({ data: vars }),
    invalidates: [adminKeys.meta.playloltcgCatalogue, adminKeys.meta.ignoredSources],
  });
}

const fetchEventFn = createServerFn({ method: "POST" })
  .validator((input: { activityShopId: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).playloltcgFetchEvent(data),
  );

export function useFetchPlayloltcgEvent() {
  return useMutationWithInvalidation<MetaSyncTriggerResult, { activityShopId: number }>({
    mutationFn: (vars) => fetchEventFn({ data: vars }),
    invalidates: acceptInvalidates,
  });
}
