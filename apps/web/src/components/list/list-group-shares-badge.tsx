import type { ListGroupSharesResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

interface Props {
  listId: string;
}

/**
 * Passive "shared with N friend groups" badge for the list page. Click opens
 * a popover listing each group; toggling lives in the list share dialog and
 * on each group's settings panel.
 * @returns The badge node, or `null` when the list isn't shared anywhere.
 */
export function ListGroupSharesBadge({ listId }: Props) {
  const userId = useRequiredUserId();
  const { data } = useQuery({
    queryKey: queryKeys.lists.groupShares(userId, listId),
    queryFn: () => fetchShares({ data: listId }),
    staleTime: 60 * 1000,
  });

  if (!data || data.items.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Badge
            variant="ghost"
            className="text-2xs hidden shrink-0 cursor-pointer sm:inline-flex"
          />
        }
      >
        <UsersIcon className="size-3" />
        Shared with {data.items.length} {data.items.length === 1 ? "group" : "groups"}
      </PopoverTrigger>
      <PopoverContent className="flex w-56 flex-col gap-1 p-2" align="start">
        <span className="text-muted-foreground px-2 py-1 text-xs">
          These groups can view this list.
        </span>
        {data.items.map((item) => (
          <Link
            key={item.groupId}
            to="/groups/$slug"
            params={{ slug: item.groupSlug }}
            className="hover:bg-muted rounded px-2 py-1.5 text-sm"
          >
            {item.groupName}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
