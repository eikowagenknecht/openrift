import type {
  MetaCatalogSort,
  MetaCatalogSortDirection,
  MetaCatalogTriage,
  TopdeckCatalogListResponse,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { adminMetaCatalogContract } from "@openrift/shared/contracts/admin/meta-catalog";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/** One filtered page of the topdeck catalogue. */
export interface TopdeckCatalogParams {
  page?: number;
  search?: string;
  triage?: MetaCatalogTriage;
  /** The source's own format word, the axis playloltcg spends on its lifecycle. */
  format?: string;
  minPlayers?: number;
  /** Inclusive `YYYY-MM-DD` bounds, read against the instant the source publishes. */
  dateFrom?: string;
  dateTo?: string;
  /** Only ever true or absent — see the note in the fetcher. */
  missing?: boolean;
  sort?: MetaCatalogSort;
  direction?: MetaCatalogSortDirection;
}

export const TOPDECK_CATALOG_PAGE_SIZE = 50;

const fetchTopdeckCatalog = createServerFn({ method: "GET" })
  .validator((input: TopdeckCatalogParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TopdeckCatalogListResponse> =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).topdeckList({
      page: data.page,
      limit: TOPDECK_CATALOG_PAGE_SIZE,
      search: data.search,
      triage: data.triage,
      format: data.format,
      minPlayers: data.minPlayers,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      sort: data.sort,
      direction: data.direction,
      // The flag filter is coerced from a query string on the way in, and
      // "false" coerces to true, so an off toggle has to be absent rather than
      // false.
      missing: data.missing === true ? true : undefined,
    }),
  );

export function useAdminTopdeckCatalog(params: TopdeckCatalogParams) {
  return useQuery(
    queryOptions({
      queryKey: queryKeys.admin.meta.topdeckCatalogueList(params),
      queryFn: () => fetchTopdeckCatalog({ data: params }),
      placeholderData: keepPreviousData,
    }),
  );
}

const acceptFn = createServerFn({ method: "POST" })
  .validator((input: { tid: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminMetaCatalogContract, context.cookie).topdeckAccept(data),
  );

const acceptInvalidates = [
  queryKeys.admin.meta.topdeckCatalogue,
  queryKeys.admin.meta.syncStatus.prefix,
  queryKeys.admin.meta.events,
  queryKeys.admin.meta.overlays,
  queryKeys.meta.all,
] as const;

export function useAcceptTopdeckEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { tid: string }) => acceptFn({ data: vars }),
    invalidates: acceptInvalidates,
  });
}

const dismissFn = createServerFn({ method: "POST" })
  .validator((input: { tid: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).topdeckDismiss(data);
  });

/** A dismiss moves the row out of the untriaged count the funnel reads. */
const dismissInvalidates = [
  queryKeys.admin.meta.topdeckCatalogue,
  queryKeys.admin.meta.syncStatus.prefix,
] as const;

export function useDismissTopdeckEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { tid: string }) => dismissFn({ data: vars }),
    invalidates: dismissInvalidates,
  });
}

const undismissFn = createServerFn({ method: "POST" })
  .validator((input: { tid: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminMetaCatalogContract, context.cookie).topdeckUndismiss(data);
  });

/** Removes the ignore key, putting the row back in the new queue. */
export function useUndismissTopdeckEvent() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { tid: string }) => undismissFn({ data: vars }),
    invalidates: [queryKeys.admin.meta.topdeckCatalogue, queryKeys.admin.meta.ignoredSources],
  });
}
