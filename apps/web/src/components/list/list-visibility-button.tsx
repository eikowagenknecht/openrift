import type { ListGroupSharesResponse, ListIntent } from "@openrift/shared";
import { listsContract } from "@openrift/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { UsersIcon } from "lucide-react";

import { PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFriendGroupsList } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { cn } from "@/lib/utils";

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
 * Group-visibility action for the list top bar. An icon-only button that lives
 * in the actions cluster: a muted icon when the list isn't visible to any of the
 * owner's groups, a solid one when it is. The full "Visible to N of M groups"
 * sentence moves into the tooltip so the title row stays uncluttered. Clicking
 * opens the visibility control (the share dialog's group section).
 * @returns The button node, or `null` when there is nothing to signal.
 */
export function ListVisibilityButton({ listId, intent, onManageVisibility }: Props) {
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

  const sharedCount = data.items.length;
  // An unshared organize list is the default state, so there's nothing to nudge
  // about; only wish/trade lists are expected to be visible to groups.
  if (sharedCount === 0 && intent === "organize") {
    return null;
  }

  const notShared = sharedCount === 0;
  const label = notShared
    ? "Not visible to your groups"
    : sharedCount >= groupCount
      ? "Visible to all your groups"
      : `Visible to ${sharedCount} of ${groupCount} groups`;

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PageTopBarIconButton
              onClick={onManageVisibility}
              aria-label={label}
              className={cn(notShared && "text-muted-foreground")}
            />
          }
        >
          <UsersIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
