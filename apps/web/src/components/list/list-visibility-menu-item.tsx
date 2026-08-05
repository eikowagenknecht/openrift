import type { ListIntent } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useFriendGroupsList } from "@/hooks/use-friend-groups";
import { listGroupSharesQueryOptions } from "@/hooks/use-list-group-shares";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

interface Props {
  listId: string;
  intent: ListIntent;
  /** Opens the list's visibility control (the share dialog's group section). */
  onManageVisibility?: () => void;
}

/**
 * Group-visibility entry for the list's ⋮ menu. The item names the action
 * ("Group visibility") and the current state rides along as a compact trailing
 * marker: muted when the list isn't visible to any of the owner's groups,
 * primary when it is. It sits in the menu rather than the actions cluster so
 * the title row keeps room for the title and the list value on a phone.
 * @returns The menu item, or `null` when there is nothing to signal.
 */
export function ListVisibilityMenuItem({ listId, intent, onManageVisibility }: Props) {
  const userId = useRequiredUserId();
  const { data } = useQuery({
    ...listGroupSharesQueryOptions(userId, listId),
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
  const status = notShared
    ? "None"
    : sharedCount >= groupCount
      ? "All"
      : `${sharedCount}/${groupCount}`;

  return (
    <DropdownMenuItem onClick={onManageVisibility}>
      <UsersIcon className="size-4" />
      Group visibility
      <span
        className={cn("ml-auto pl-3 text-xs", notShared ? "text-muted-foreground" : "text-primary")}
      >
        {status}
      </span>
    </DropdownMenuItem>
  );
}
