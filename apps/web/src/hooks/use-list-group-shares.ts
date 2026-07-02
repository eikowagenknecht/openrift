import type { ListGroupSharesResponse } from "@openrift/shared";
import { listsContract } from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchShares = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }): Promise<ListGroupSharesResponse> => {
    // 404 (unknown list, or one belonging to another user) maps to the
    // NOT_FOUND sentinel — the raw ORPCError crossing the server-fn boundary
    // unhandled is Sentry noise (the sentinel is in ignoreErrors, see
    // instrument.server.mjs), and the page's detail query 404s the route anyway.
    const { error, data } = await safe(
      apiOrpcClient(listsContract, context.cookie).groupShares({ id: listId }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

/**
 * Query options for the friend groups a list is currently shared with. Shared
 * by the suspense hook below and the passive badge in `ListVisibilityButton`.
 * @returns Query options keyed on owner + list.
 */
export function listGroupSharesQueryOptions(userId: string, listId: string) {
  return queryOptions({
    queryKey: queryKeys.lists.groupShares(userId, listId),
    queryFn: () => fetchShares({ data: listId }),
  });
}

/**
 * Friend groups a list is currently shared with (read-only).
 * Used by the list share dialog's group-toggle panel and by the passive
 * "shared with N groups" badge on the list header.
 *
 * @returns The query result; `data.items` is empty if not shared with any group.
 */
export function useListGroupShares(listId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(listGroupSharesQueryOptions(userId, listId));
}
