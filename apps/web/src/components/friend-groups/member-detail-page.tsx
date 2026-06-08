import type { FriendGroupRole, ListIntent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchTradeList } from "./match-row-card";
import { SharedCollectionRow } from "./shared-collection-row";
import { SharedListRow } from "./shared-list-row";

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
  const sortedCollections = data.collectionShares.toSorted((a, b) =>
    a.collectionName.localeCompare(b.collectionName),
  );
  const hasCollections = sortedCollections.length > 0;

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
          <Heading level={1}>{member.userName ?? "Unknown user"}</Heading>
          {member.nickname ? <p className="text-muted-foreground">{member.nickname}</p> : null}
          <Badge variant="outline" className="w-fit text-xs">
            {ROLE_LABEL[member.role]}
          </Badge>
        </div>
      </header>

      {data.matches.length > 0 || data.reverseMatches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Possible trades
          </h2>
          <MatchTradeList
            incoming={data.matches}
            outgoing={data.reverseMatches}
            groupSlug={slug}
            showCounterparty={false}
          />
        </section>
      ) : null}

      {hasCollections ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Collections
          </h2>
          <div className="flex flex-col gap-2">
            {sortedCollections.map((share) => (
              <SharedCollectionRow key={share.collectionId} slug={slug} share={share} />
            ))}
          </div>
        </section>
      ) : null}

      {hasShares
        ? LIST_SECTIONS.map(({ intent, heading }) => {
            const sectionShares = sortedShares.filter((share) => share.listIntent === intent);
            if (sectionShares.length === 0) {
              return null;
            }
            return (
              <section key={intent} className="flex flex-col gap-3">
                <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                  {heading}
                </h2>
                <div className="flex flex-col gap-2">
                  {sectionShares.map((share) => (
                    <SharedListRow
                      key={share.listId}
                      slug={slug}
                      member={member}
                      share={share}
                      showMember={false}
                    />
                  ))}
                </div>
              </section>
            );
          })
        : null}

      {!hasShares && !hasCollections ? (
        <p className="text-muted-foreground">
          {member.userName ?? "This member"} hasn&apos;t shared any collections or lists with this
          group yet.
        </p>
      ) : null}
    </div>
  );
}
