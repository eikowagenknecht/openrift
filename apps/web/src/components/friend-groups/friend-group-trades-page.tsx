import type { FriendGroupDetailResponse } from "@openrift/shared";

import { useGroupTrades } from "@/hooks/use-card-trades";
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { withoutLiveTradeMatches } from "@/lib/trade-derivation";

import { SECTION_HEADING } from "./friend-group-shell";
import { MatchTradeList } from "./match-row-card";
import { TradesSection } from "./trades-section";

/**
 * The Trades page: suggested trades (matches) up top, then the viewer's own
 * trades in this group bucketed into Action needed / Active / History.
 * @returns The trades-page content.
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
      <SuggestedSection slug={slug} data={data} />
      <TradesSection groupId={data.group.id} />
    </div>
  );
}

function SuggestedSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);

  // Hide a suggestion once it has a live (pending/reserved) trade with the same
  // member for the same card, so it doesn't echo the in-progress trade below.
  const trades = tradesData?.items ?? [];
  const incoming = withoutLiveTradeMatches(matches.othersHaveYourWants, trades);
  const outgoing = withoutLiveTradeMatches(matches.othersWantYourHaves, trades);
  const hasMatches = incoming.length > 0 || outgoing.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className={SECTION_HEADING}>Possible trades</h2>
      {hasMatches ? (
        <MatchTradeList incoming={incoming} outgoing={outgoing} groupSlug={slug} />
      ) : (
        <SuggestedEmptyState data={data} />
      )}
    </section>
  );
}

function SuggestedEmptyState({ data }: { data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const viewerShares = data.shares.filter((share) => share.userId === viewerId);
  const othersShare = data.shares.some((share) => share.userId !== viewerId);

  if (!othersShare) {
    return (
      <p className="text-muted-foreground">
        No members are sharing lists with this group yet. Ask them to share a wishlist or tradelist
        to start seeing trades.
      </p>
    );
  }
  if (!viewerShares.some((share) => share.listIntent === "wish" || share.listIntent === "trade")) {
    return (
      <p className="text-muted-foreground">
        Share a wishlist or tradelist with this group from Manage to see possible trades.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      No matches right now. You&apos;ll see possible trades here when your wants and haves overlap
      with another member&apos;s.
    </p>
  );
}
