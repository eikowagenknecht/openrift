import type { ListIntent } from "@openrift/shared/types/api/list";
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
  onManageVisibility?: () => void;
}

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
