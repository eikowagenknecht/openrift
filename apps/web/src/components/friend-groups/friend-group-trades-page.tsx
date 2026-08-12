import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useGroupTrades, useUserTrades } from "@/hooks/use-card-trades";
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { buildTradeHubCards } from "@/lib/trade-hub";

import { ShareYourListsBand, TradeHubMemberCard } from "./trade-hub";

/**
 * The Trades page: one card per member, then the band about your own lists. The
 * page has a single job, which is getting you to the right person — a trade is
 * carried out with someone, and their requests, their suggestions and their
 * shared lists are one conversation. Acting on any of it happens on their trade
 * sheet, so nothing here is a button.
 * @returns the trades-page content.
 */
export function TradesPageContent({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  return (
    <div className="flex flex-col gap-8">
      <TradeHub slug={slug} data={data} />
      <Suspense fallback={null}>
        <ShareYourListsBand slug={slug} groupName={data.group.name} />
      </Suspense>
    </div>
  );
}

/**
 * The hub proper: the group as people, the ones who want something from you
 * first.
 * @returns The member cards.
 */
function TradeHub({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: allTradesData } = useUserTrades();

  const trades = tradesData?.items ?? [];
  const cards = buildTradeHubCards({
    viewerId,
    groupId: data.group.id,
    members: data.members,
    groupTrades: trades,
    // Falls back to the group's own trades until the all-groups list loads.
    allTrades: allTradesData?.items ?? trades,
    incoming: matches.othersHaveYourWants,
    outgoing: matches.othersWantYourHaves,
    shares: data.shares,
  });

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Invite people to start trading"
        description="Trades happen between members, so this group needs someone else in it first."
      >
        <Button render={<Link to="/groups/$slug/members" params={{ slug }} />}>View members</Button>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <TradeHubMemberCard key={card.member.userId} card={card} />
      ))}
    </div>
  );
}
