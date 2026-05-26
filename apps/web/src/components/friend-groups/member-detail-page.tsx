import type { FriendGroupRole, ListIntent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Badge } from "@/components/ui/badge";
import { useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchRowGroup } from "./match-row-card";

interface MemberDetailPageProps {
  slug: string;
  userId: string;
}

const INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize list",
};

const INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

const INTENT_ORDER: Record<ListIntent, number> = {
  wish: 0,
  trade: 1,
  organize: 2,
};

const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function MemberDetailPage({ slug, userId }: MemberDetailPageProps) {
  const { data } = useFriendGroupMemberDetail(slug, userId);
  const { member } = data;

  const sortedShares = data.shares.toSorted((a, b) => {
    const intentDiff = INTENT_ORDER[a.listIntent] - INTENT_ORDER[b.listIntent];
    if (intentDiff !== 0) {
      return intentDiff;
    }
    return a.listName.localeCompare(b.listName);
  });

  return (
    <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", PAGE_PADDING)}>
      <Link
        to="/groups/$slug"
        params={{ slug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeftIcon className="size-4" />
        Back to group
      </Link>

      <header className="flex items-center gap-4">
        {member.userImage ? (
          <img src={member.userImage} alt="" className="size-14 rounded-full" />
        ) : (
          <div className="bg-muted size-14 rounded-full" />
        )}
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold">{member.userName ?? "Unknown user"}</h1>
          {member.nickname ? <p className="text-muted-foreground">{member.nickname}</p> : null}
          <Badge variant="outline" className="w-fit text-xs">
            {ROLE_LABEL[member.role]}
          </Badge>
        </div>
      </header>

      {data.matches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            They have what you want
          </h2>
          <MatchRowGroup rows={data.matches} groupSlug={slug} />
        </section>
      )}

      {data.reverseMatches.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            They want what you have
          </h2>
          <MatchRowGroup rows={data.reverseMatches} groupSlug={slug} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Their shared lists
        </h2>
        {sortedShares.length === 0 ? (
          <p className="text-muted-foreground">
            {member.userName ?? "This member"} hasn&apos;t shared any lists with this group yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedShares.map((share) => {
              const Icon = INTENT_ICON[share.listIntent];
              return (
                <Link
                  key={share.listId}
                  to="/groups/$slug/lists/$listId"
                  params={{ slug, listId: share.listId }}
                  className="bg-card text-card-foreground hover:bg-muted flex items-center gap-3 rounded-lg border p-3 transition-colors"
                >
                  <Icon className="text-muted-foreground size-5 shrink-0" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{share.listName}</span>
                    <span className="text-muted-foreground text-2xs">
                      {INTENT_LABEL[share.listIntent]}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
