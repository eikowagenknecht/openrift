import type {
  FriendGroupMemberResponse,
  FriendGroupShareResponse,
  ListIntent,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { Card } from "@/components/ui/card";
import { cardLinkVariants } from "@/components/ui/card-link";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

import { LIST_INTENT_ICON, LIST_KIND_NOUN } from "./list-intent-meta";

const LIST_INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize",
};

/**
 * One wide row for a shared wishlist/tradelist: intent icon, list name (links to
 * the shared list view), kind/count meta, and an optional owner chip. Reused on
 * the group Trading tab (with the owner inlined) and the member-detail page
 * (without, since the page is already scoped to one member).
 * @returns The shared-list row element.
 */
export function SharedListRow({
  slug,
  member,
  share,
  showMember = true,
}: {
  slug: string;
  member: FriendGroupMemberResponse;
  share: FriendGroupShareResponse;
  showMember?: boolean;
}) {
  const IntentIcon = LIST_INTENT_ICON[share.listIntent];
  const noun =
    share.entryCount === 1
      ? LIST_KIND_NOUN[share.listKind].singular
      : LIST_KIND_NOUN[share.listKind].plural;
  return (
    <Card className={cn(cardLinkVariants(), "relative flex-row items-center gap-3 p-2")}>
      <IntentIcon className="text-muted-foreground size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          to="/groups/$slug/lists/$listId"
          params={{ slug, listId: share.listId }}
          search={{ fromUser: share.userId }}
          className="font-medium before:absolute before:inset-0 before:content-['']"
        >
          <span className="block truncate">{share.listName}</span>
        </Link>
        <span className="text-muted-foreground text-xs">
          {LIST_INTENT_LABEL[share.listIntent]} · {share.entryCount} {noun}
        </span>
      </div>
      {showMember ? (
        <Link
          to="/groups/$slug/members/$userId"
          params={{ slug, userId: member.userId }}
          className="hover:bg-muted/60 relative z-10 flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1"
        >
          <UserAvatar
            image={member.userImage}
            name={member.userName}
            gravatarHash={member.gravatarHash}
            size="sm"
          />
          <span className="hidden text-sm sm:inline">{member.userName ?? "Member"}</span>
        </Link>
      ) : null}
    </Card>
  );
}
