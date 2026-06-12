import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { HandshakeIcon, HeartIcon, Share2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGroupTrades } from "@/hooks/use-card-trades";
import {
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/hooks/use-friend-groups";
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
        <SuggestedEmptyState slug={slug} data={data} />
      )}
    </section>
  );
}

function SuggestedEmptyState({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const viewerShares = data.shares.filter((share) => share.userId === viewerId);
  const othersShare = data.shares.some((share) => share.userId !== viewerId);
  const viewerSharesTradable = viewerShares.some(
    (share) => share.listIntent === "wish" || share.listIntent === "trade",
  );

  if (!othersShare && viewerSharesTradable) {
    return (
      <p className="text-muted-foreground">
        No members are sharing lists with this group yet. Ask them to share a wishlist or tradelist
        to start seeing trades.
      </p>
    );
  }
  if (!viewerSharesTradable) {
    return <ShareYourListsPrompt slug={slug} />;
  }
  return (
    <p className="text-muted-foreground">
      No matches right now. You&apos;ll see possible trades here when your wants and haves overlap
      with another member&apos;s.
    </p>
  );
}

/**
 * Shown when the viewer has no wish/trade list shared with this group — the
 * state every confused "why is this empty?" member lands in. Explains why
 * there are no matches and offers a one-click share for each of their
 * unshared wish/trade lists, right here instead of on the Manage page.
 * @returns The prompt node.
 */
function ShareYourListsPrompt({ slug }: { slug: string }) {
  const { data } = useFriendGroupShareableLists(slug);
  const share = useShareListWithFriendGroup();

  const candidates = data.items.filter(
    (item) => (item.listIntent === "wish" || item.listIntent === "trade") && item.sharedAt === null,
  );

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground">
        You don&apos;t have a wishlist or tradelist yet.{" "}
        <Link to="/collections" className="text-foreground underline underline-offset-4">
          Create one
        </Link>{" "}
        and it will be visible to this group automatically.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-4">
      <p className="text-muted-foreground">
        This group can&apos;t see any of your lists yet, so there are no matches. Share a wishlist
        or tradelist to let members find trades with you.
      </p>
      <ul className="flex flex-col gap-2">
        {candidates.map((item) => (
          <li key={item.listId} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {item.listIntent === "wish" ? (
                <HeartIcon className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <HandshakeIcon className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="truncate font-medium">{item.listName}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {item.entryCount} {item.entryCount === 1 ? "card" : "cards"}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => share.mutate({ slug, listId: item.listId })}
              disabled={share.isPending}
            >
              <Share2Icon className="size-4" />
              Share
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
