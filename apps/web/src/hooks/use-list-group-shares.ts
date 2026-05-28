import type { ListGroupSharesResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchShares = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: listId }): Promise<ListGroupSharesResponse> =>
      fetchApiJson<ListGroupSharesResponse>({
        errorTitle: "Couldn't load group shares",
        cookie: context.cookie,
        path: `/api/v1/lists/${encodeURIComponent(listId)}/group-shares`,
      }),
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
