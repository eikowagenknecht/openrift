import type { ListGroupSharesResponse } from "@openrift/shared";
import { listsContract } from "@openrift/shared/contracts";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchShares = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: listId }): Promise<ListGroupSharesResponse> =>
      apiOrpcClient(listsContract, context.cookie).groupShares({ id: listId }),
  );

/**
 * Friend groups a list is currently shared with (read-only).
 * Used by the list share dialog's group-toggle panel and by the passive
 * "shared with N groups" badge on the list header.
 *
 * @returns The query result; `data.items` is empty if not shared with any group.
 */
export function useListGroupShares(listId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: queryKeys.lists.groupShares(userId, listId),
      queryFn: () => fetchShares({ data: listId }),
    }),
  );
}
