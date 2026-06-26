import type { ListGroupSharesResponse, ListIntent } from "@openrift/shared";
import { listsContract } from "@openrift/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useFriendGroupsList } from "@/hooks/use-friend-groups";
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

interface Props {
  listId: string;
  intent: ListIntent;
  /** Opens the list's visibility control (the share dialog's group section). */
  onManageVisibility?: () => void;
}

/**
 * Group-visibility badge for the list header. Shows "Visible to N groups"
 * when the list is shared, or a quiet "Not visible to your groups" nudge for
 * wish/trade lists that aren't shared anywhere even though the owner has
 * groups. Clicking either opens the visibility control.
 * @returns The badge node, or `null` when there is nothing to signal.
 */
export function ListGroupSharesBadge({ listId, intent, onManageVisibility }: Props) {
  const userId = useRequiredUserId();
  const { data } = useQuery({
    queryKey: queryKeys.lists.groupShares(userId, listId),
    queryFn: () => fetchShares({ data: listId }),
    staleTime: 60 * 1000,
  });
  const groupCount = useFriendGroupsList(true).data?.items.length ?? 0;

  if (!data || groupCount === 0) {
    return null;
  }

  if (data.items.length === 0) {
    // An unshared organize list is the default; only wish/trade lists are
    // expected to be visible, so only they get the nudge.
    if (intent === "organize") {
      return null;
    }
    return (
      <Badge
        variant="ghost"
        className="text-2xs text-muted-foreground hidden shrink-0 cursor-pointer sm:inline-flex"
        render={
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Badge injects the visible text as the button's children at render time
          <button type="button" onClick={onManageVisibility} />
        }
      >
        <UsersIcon className="size-3" />
        Not visible to your groups
      </Badge>
    );
  }

  const visibleToAll = data.items.length >= groupCount;
  return (
    <Badge
      variant="ghost"
      className="text-2xs hidden shrink-0 cursor-pointer sm:inline-flex"
      render={
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Badge injects the visible text as the button's children at render time
        <button type="button" onClick={onManageVisibility} />
      }
    >
      <UsersIcon className="size-3" />
      {visibleToAll
        ? "Visible to your groups"
        : `Visible to ${data.items.length} of ${groupCount} groups`}
    </Badge>
  );
}
