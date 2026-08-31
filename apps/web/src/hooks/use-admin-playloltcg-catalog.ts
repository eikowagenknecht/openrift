import type {
  MetaCatalogTriage,
  PlayloltcgCatalogListResponse,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { adminMetaCatalogContract } from "@openrift/shared/contracts/admin/meta-catalog";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/** One filtered page of the playloltcg catalogue. */
export interface PlayloltcgCatalogParams {
  page?: number;
  search?: string;
  triage?: MetaCatalogTriage;
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
    }),
  );

export function useAdminPlayloltcgCatalog(params: PlayloltcgCatalogParams) {
  return useQuery(
    queryOptions({
      queryKey: queryKeys.admin.meta.playloltcgCatalogueList(params),
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
  queryKeys.admin.meta.playloltcgCatalogue,
  queryKeys.admin.meta.syncStatus.prefix,
  queryKeys.admin.meta.events,
  queryKeys.admin.meta.overlays,
  queryKeys.meta.all,
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

/** A dismiss moves the row out of the untriaged count the funnel reads. */
const dismissInvalidates = [
  queryKeys.admin.meta.playloltcgCatalogue,
  queryKeys.admin.meta.syncStatus.prefix,
] as const;

export function useDismissPlayloltcgEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { activityShopId: number }) => dismissFn({ data: vars }),
    invalidates: dismissInvalidates,
  });
}
