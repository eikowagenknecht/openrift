import type { ListIntent } from "@openrift/shared";
import { isTradedCardTrade } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { HandshakeIcon } from "lucide-react";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { EmptyState } from "@/components/empty-state";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { PersonPageHeader } from "@/components/person-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardList } from "@/components/ui/card-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { useGroupTrades, useTradeSheet, useUserTrades } from "@/hooks/use-card-trades";
import { useFriendGroupDetail, useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import {
  bucketMemberTrades,
  countTradeSuggestions,
  withoutLiveTradeMatches,
} from "@/lib/trade-derivation";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

import { ContactMethodChips } from "./contact-method-chips";
import { ROLE_LABEL } from "./friend-group-shell";
import { SharedCollectionRow } from "./shared-collection-row";
import { SharedListRow } from "./shared-list-row";

interface MemberDetailPageProps {
  slug: string;
  userId: string;
}

const LIST_SECTIONS: { intent: Extract<ListIntent, "wish" | "trade">; heading: string }[] = [
  { intent: "wish", heading: "Wishlists" },
  { intent: "trade", heading: "Tradelists" },
];

// tradedCount keeps the fallback honest: without it, a member you'd traded 58
// cards with could still read "Nothing traded yet".
function tradeSummaryLine(
  openCount: number,
  needsYouCount: number,
  matchCount: number,
  tradedCount: number,
): string {
  const parts: string[] = [];
  if (openCount > 0) {
    parts.push(`${openCount} open ${openCount === 1 ? "trade" : "trades"}`);
  }
  if (needsYouCount > 0) {
    parts.push(`${needsYouCount} needs you`);
  }
  if (matchCount > 0) {
    parts.push(`${matchCount} possible ${matchCount === 1 ? "trade" : "trades"}`);
  }
  if (tradedCount > 0) {
    parts.push(`${tradedCount} ${tradedCount === 1 ? "trade" : "trades"} done`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Nothing traded yet";
}

// Own component: the API refuses to open a trade sheet for the viewer's own
// page, so this is mounted only for other members.
function MemberTradeSection({
  slug,
  userId,
  groupId,
  memberName,
  hasSharedAnything,
}: {
  slug: string;
  userId: string;
  groupId: string;
  memberName: string;
  hasSharedAnything: boolean;
}) {
  const { data: tradesData } = useGroupTrades(groupId);
  const { data: allTradesData } = useUserTrades();
  const { data: sheet } = useTradeSheet(userId);

  // Drops suggestions that already have a live trade with this member, so a
  // suggestion and the trade it became aren't counted twice.
  const liveTrades = allTradesData?.items ?? tradesData?.items ?? [];
  const incomingMatches = withoutLiveTradeMatches(sheet.othersHaveYourWants, liveTrades);
  const outgoingMatches = withoutLiveTradeMatches(sheet.othersWantYourHaves, liveTrades);
  const { active, actionNeeded } = bucketMemberTrades(liveTrades, userId);
  const tradedCount = liveTrades.filter(
    (trade) => trade.counterparty.userId === userId && isTradedCardTrade(trade),
  ).length;
  const openCount = active.length + actionNeeded.length;
  const matchCount = countTradeSuggestions(incomingMatches, outgoingMatches);
  const tradeSummary = tradeSummaryLine(openCount, actionNeeded.length, matchCount, tradedCount);

  // Otherwise a member with no shares and no trades would show a "Nothing
  // traded yet" card stacked on a "hasn't shared anything" line.
  if (!hasSharedAnything && openCount === 0 && matchCount === 0 && tradedCount === 0) {
    return (
      <EmptyState
        icon={HandshakeIcon}
        title="Nothing here yet"
        description={`${memberName} hasn't shared any lists or collections with this group, and the two of you haven't traded.`}
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Trades</SectionHeading>
      <Card className="flex-row flex-wrap items-center justify-between gap-3 p-3">
        <p className="min-w-0">{tradeSummary}</p>
        <Button render={<Link to="/trades/$userId" params={{ userId }} search={{ from: slug }} />}>
          Open trade sheet
        </Button>
      </Card>
      {hasSharedAnything ? null : (
        <p className="text-muted-foreground">
          {memberName} hasn&apos;t shared any collections or lists with this group yet.
        </p>
      )}
    </section>
  );
}

export function MemberDetailPage({ slug, userId }: MemberDetailPageProps) {
  const { data } = useFriendGroupMemberDetail(slug, userId);
  const { data: groupDetail } = useFriendGroupDetail(slug);
  const viewerId = useRequiredUserId();
  const isSelf = userId === viewerId;
  const { member } = data;

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
      <CardDetailOverlayProvider>
        <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6", PAGE_PADDING)}>
          <header>
            <PersonPageHeader
              image={member.userImage}
              name={member.userName}
              gravatarHash={member.gravatarHash}
            >
              <Badge variant="outline">{ROLE_LABEL[member.role]}</Badge>
              <ContactMethodChips methods={member.contactMethods} />
            </PersonPageHeader>
          </header>

          {isSelf ? null : (
            <MemberTradeSection
              slug={slug}
              userId={userId}
              groupId={groupDetail.group.id}
              memberName={member.userName ?? "This member"}
              hasSharedAnything={hasShares || hasCollections}
            />
          )}

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

          {isSelf && !hasShares && !hasCollections ? (
            <p className="text-muted-foreground">
              You haven&apos;t shared any collections or lists with this group yet.
            </p>
          ) : null}
        </div>
      </CardDetailOverlayProvider>
    </>
  );
}
