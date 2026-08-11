import type { ListIntent } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { CardList } from "@/components/ui/card-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useGroupTrades, useUserTrades } from "@/hooks/use-card-trades";
import { useFriendGroupDetail, useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import { withoutLiveTradeMatches } from "@/lib/trade-derivation";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { ContactMethodChips } from "./contact-method-chips";
import { ROLE_LABEL } from "./friend-group-shell";
import { MatchTradeList } from "./match-row-card";
import { SharedCollectionRow } from "./shared-collection-row";
import { SharedListRow } from "./shared-list-row";
import { MemberTradesSection } from "./trades-section";

interface MemberDetailPageProps {
  slug: string;
  userId: string;
}

const LIST_SECTIONS: { intent: Extract<ListIntent, "wish" | "trade">; heading: string }[] = [
  { intent: "wish", heading: "Wishlists" },
  { intent: "trade", heading: "Tradelists" },
];

export function MemberDetailPage({ slug, userId }: MemberDetailPageProps) {
  const { data } = useFriendGroupMemberDetail(slug, userId);
  const { data: groupDetail } = useFriendGroupDetail(slug);
  const { data: tradesData } = useGroupTrades(groupDetail.group.id);
  const { data: allTradesData } = useUserTrades();
  const { member } = data;

  // Drop match suggestions that already have a live trade with this member for
  // the same card — here or in another shared group — so a suggestion and its
  // in-progress trade don't both show; the in-progress trade renders in
  // MemberTradesSection instead. Mirrors the Trades page's SuggestedSection,
  // with the same fallback to the group's own trades until the all-groups
  // list loads.
  const liveTrades = allTradesData?.items ?? tradesData?.items ?? [];
  const incomingMatches = withoutLiveTradeMatches(data.matches, liveTrades);
  const outgoingMatches = withoutLiveTradeMatches(data.reverseMatches, liveTrades);
  const hasMatches = incomingMatches.length > 0 || outgoingMatches.length > 0;

  const sortedShares = data.shares.toSorted((a, b) => a.listName.localeCompare(b.listName));
  const hasShares = sortedShares.length > 0;
  const sortedCollections = data.collectionShares.toSorted((a, b) =>
    a.collectionName.localeCompare(b.collectionName),
  );
  const hasCollections = sortedCollections.length > 0;

  return (
    <>
      <TopBarBreadcrumbBar
        segments={[
          { label: groupDetail.group.name, link: <Link to="/groups/$slug" params={{ slug }} /> },
          { label: "Members", link: <Link to="/groups/$slug/members" params={{ slug }} /> },
          { label: member.userName ?? "Member" },
        ]}
      />
      {/* Card names in the trade and match rows below open the detail overlay
          the provider mounts — the same as on the group's Trades page. */}
      <CardDetailOverlayProvider>
        <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
          <header className="flex items-center gap-4">
            <UserAvatar
              image={member.userImage}
              name={member.userName}
              gravatarHash={member.gravatarHash}
              size="lg"
              className="size-14"
            />
            <div className="flex flex-col gap-1">
              <Heading level={1}>{member.userName ?? "Unknown user"}</Heading>
              <Badge variant="outline" className="w-fit text-xs">
                {ROLE_LABEL[member.role]}
              </Badge>
              <ContactMethodChips methods={member.contactMethods} />
            </div>
          </header>

          <MemberTradesSection groupId={groupDetail.group.id} counterpartyUserId={userId} />

          {hasMatches ? (
            <section className="flex flex-col gap-3">
              <SectionHeading>Possible trades</SectionHeading>
              <MatchTradeList
                incoming={incomingMatches}
                outgoing={outgoingMatches}
                groupSlug={slug}
                showCounterparty={false}
              />
            </section>
          ) : null}

          {hasCollections ? (
            <section className="flex flex-col gap-3">
              <SectionHeading>Collections</SectionHeading>
              <CardList>
                {sortedCollections.map((share) => (
                  <li key={share.collectionId}>
                    <SharedCollectionRow slug={slug} share={share} />
                  </li>
                ))}
              </CardList>
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
                    <SectionHeading>{heading}</SectionHeading>
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
              {member.userName ?? "This member"} hasn&apos;t shared any collections or lists with
              this group yet.
            </p>
          ) : null}
        </div>
      </CardDetailOverlayProvider>
    </>
  );
}
