import type {
  FriendGroupMemberResponse,
  FriendGroupShareResponse,
  ListIntent,
  ListKind,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";

const LIST_INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

const LIST_INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize",
};

const LIST_KIND_NOUN: Record<ListKind, { singular: string; plural: string }> = {
  card: { singular: "Card", plural: "Cards" },
  printing: { singular: "Printing", plural: "Printings" },
  copy: { singular: "Copy", plural: "Copies" },
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
    <Card className="hover:bg-muted relative flex-row items-center gap-3 p-2 transition-colors">
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
