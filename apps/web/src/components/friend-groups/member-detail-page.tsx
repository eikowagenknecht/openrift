import type { ListIntent } from "@openrift/shared";
import { isTradedCardTrade } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardList } from "@/components/ui/card-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useGroupTrades, useTradeSheet, useUserTrades } from "@/hooks/use-card-trades";
import { useFriendGroupDetail, useFriendGroupMemberDetail } from "@/hooks/use-friend-groups";
import {
  bucketMemberTrades,
  countTradeSuggestions,
  withoutLiveTradeMatches,
} from "@/lib/trade-derivation";
import { cn, PAGE_PADDING } from "@/lib/utils";

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

/**
 * The one-line state of play with this member, for the summary card that stands
 * in for the trade rows and suggestions the trade sheet now owns. Parts that
 * are zero are left out rather than printed as "0", so the line only ever says
 * something is there.
 * @param openCount Live trades with the member (in progress plus awaiting them).
 * @param needsYouCount How many of those are waiting on the viewer.
 * @param matchCount Distinct suggestions the matcher found with them.
 * @param tradedCount Trades with them whose cards changed hands.
 * @returns The summary sentence.
 */
// Every count it takes is person-level (pooled across shared groups), which is
// what makes the "nothing" case safe to say on a page that lives inside one
// group.
//
// The finished trades are in here because the fallback claims a fact it was not
// measuring: with nothing open and nothing suggested, the line read "Nothing
// traded yet" at someone the viewer had swapped 58 cards with. It now only says
// that when there is genuinely no history either.
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

export function MemberDetailPage({ slug, userId }: MemberDetailPageProps) {
  const { data } = useFriendGroupMemberDetail(slug, userId);
  const { data: groupDetail } = useFriendGroupDetail(slug);
  const { data: tradesData } = useGroupTrades(groupDetail.group.id);
  const { data: allTradesData } = useUserTrades();
  // The same pooled matches the trade sheet renders, rather than this group's
  // own: the summary below stands in for that page, and a group-scoped count
  // under person-scoped trade counts said "nothing" about a member the sheet
  // then showed suggestions for.
  const { data: sheet } = useTradeSheet(userId);
  const { member } = data;

  // Drop match suggestions that already have a live trade with this member for
  // the same card — here or in another shared group — so a suggestion and the
  // trade it became aren't counted twice. Mirrors the Trades page's
  // SuggestedSection, with the same fallback to the group's own trades until
  // the all-groups list loads.
  const liveTrades = allTradesData?.items ?? tradesData?.items ?? [];
  const incomingMatches = withoutLiveTradeMatches(sheet.othersHaveYourWants, liveTrades);
  const outgoingMatches = withoutLiveTradeMatches(sheet.othersWantYourHaves, liveTrades);
  const { active, actionNeeded } = bucketMemberTrades(liveTrades, userId);
  const tradedCount = liveTrades.filter(
    (trade) => trade.counterparty.userId === userId && isTradedCardTrade(trade),
  ).length;
  const tradeSummary = tradeSummaryLine(
    active.length + actionNeeded.length,
    actionNeeded.length,
    countTradeSuggestions(incomingMatches, outgoingMatches),
    tradedCount,
  );

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

          {/* Everything about trading with this member — the live rows, the
              suggestions and the history — lives on the person-level trade
              sheet, which pools every group the two share. This page keeps the
              headline and hands off. */}
          <section className="flex flex-col gap-3">
            <SectionHeading>Trades</SectionHeading>
            <Card className="flex-row flex-wrap items-center justify-between gap-3 p-3">
              <p className="min-w-0">{tradeSummary}</p>
              <Button
                render={<Link to="/trades/$userId" params={{ userId }} search={{ from: slug }} />}
              >
                Open trade sheet
              </Button>
            </Card>
          </section>

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
