import { listsContract } from "@openrift/shared/contracts/lists";
import type { ListGroupSharesResponse } from "@openrift/shared/types/api/friend-group";
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
    // Maps 404 to the NOT_FOUND sentinel; an unhandled ORPCError crossing the
    // server-fn boundary is Sentry noise (sentinel is in instrument.server.mjs ignoreErrors).
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

export function listGroupSharesQueryOptions(userId: string, listId: string) {
  return queryOptions({
    queryKey: queryKeys.lists.groupShares(userId, listId),
    queryFn: () => fetchShares({ data: listId }),
  });
}

export function useListGroupShares(listId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(listGroupSharesQueryOptions(userId, listId));
}
