import type { FriendGroupRole, ListIntent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { PublicListRow } from "@/components/list/public-list-row";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchRowGroup } from "./match-row-card";

interface MemberDetailPageProps {
  slug: string;
  userId: string;
}

const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const LIST_SECTIONS: { intent: Extract<ListIntent, "wish" | "trade">; heading: string }[] = [
  { intent: "wish", heading: "Wishlists" },
  { intent: "trade", heading: "Tradelists" },
];

export function MemberDetailPage({ slug, userId }: MemberDetailPageProps) {
  const { data } = useFriendGroupMemberDetail(slug, userId);
  const { member } = data;

  const sortedShares = data.shares.toSorted((a, b) => a.listName.localeCompare(b.listName));
  const hasShares = sortedShares.length > 0;

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
        <UserAvatar
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          size="lg"
          className="size-14"
        />
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

      {hasShares ? (
        LIST_SECTIONS.map(({ intent, heading }) => {
          const sectionShares = sortedShares.filter((share) => share.listIntent === intent);
          if (sectionShares.length === 0) {
            return null;
          }
          return (
            <section key={intent} className="flex flex-col gap-3">
              <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                {heading}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionShares.map((share) => (
                  <PublicListRow
                    key={share.listId}
                    intent={share.listIntent}
                    kind={share.listKind}
                    name={share.listName}
                    entryCount={share.entryCount}
                    render={
                      <Link
                        to="/groups/$slug/lists/$listId"
                        params={{ slug, listId: share.listId }}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <p className="text-muted-foreground">
          {member.userName ?? "This member"} hasn&apos;t shared any lists with this group yet.
        </p>
      )}
    </div>
  );
}
