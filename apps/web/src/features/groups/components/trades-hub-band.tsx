import { needsViewerAction } from "@openrift/shared/card-trade-lifecycle";
import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ZapIcon } from "lucide-react";

import { ActionBand } from "@/components/ui/action-band";
import { buttonVariants } from "@/components/ui/button";
import { CardArtThumbStack } from "@/features/cards/components/card-art-thumb-stack";
import { useCards } from "@/features/cards/hooks/use-cards";
import { frontImageId } from "@/features/cards/lib/card-meta";
import { useGroupTrades, useUserTrades } from "@/features/groups/hooks/use-card-trades";
import { useFriendGroupMatches } from "@/features/groups/hooks/use-friend-groups";
import { withoutLiveTradeMatches } from "@/features/groups/lib/trade-derivation";
import type { TradeShelfRow } from "@/features/groups/lib/trade-hub";
import { buildTradeShelf } from "@/features/groups/lib/trade-hub";
import { cn } from "@/lib/utils";

const MAX_THUMBS = 5;

function ShelfRow({
  row,
  printingsById,
}: {
  row: TradeShelfRow;
  printingsById: ReturnType<typeof useCards>["printingsById"];
}) {
  const items = row.printingIds.map((printingId) => ({
    key: printingId,
    imageId: frontImageId(printingsById[printingId]),
  }));
  return (
    <li className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span
        className={cn(
          "text-xs font-medium tracking-wide uppercase sm:w-32 sm:shrink-0",
          row.tone === "warning" ? "text-warning" : "text-success",
        )}
      >
        {row.label}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <CardArtThumbStack items={items} max={MAX_THUMBS} thumbClassName="w-8" />
        <span className="text-muted-foreground min-w-0 truncate text-sm">{row.detail}</span>
      </div>
    </li>
  );
}

export function TradesHubBand({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: allTradesData } = useUserTrades();
  const { printingsById } = useCards();

  const trades = tradesData?.items ?? [];
  // Falls back to this group's own trades until the all-groups list loads.
  const liveTrades = allTradesData?.items ?? trades;
  const shelf = buildTradeShelf({
    needsYou: trades.filter((trade) => needsViewerAction(trade)),
    incoming: withoutLiveTradeMatches(matches.othersHaveYourWants, liveTrades),
    outgoing: withoutLiveTradeMatches(matches.othersWantYourHaves, liveTrades),
  });

  const needsAction = shelf.waitingPeople > 0;
  return (
    <ActionBand
      render={<Link to="/groups/$slug/trades" params={{ slug }} />}
      icon={ZapIcon}
      tone={needsAction ? "gold" : shelf.rows.length > 0 ? "success" : "neutral"}
      accent={needsAction}
      label="Trades"
      value={shelf.headline}
      valueClassName="font-sans truncate text-base font-medium"
      action={
        <span
          className={cn(
            buttonVariants({ variant: needsAction ? "default" : "ghost" }),
            needsAction && "group-hover/action-band:bg-primary/90",
          )}
        >
          View trades
          <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
        </span>
      }
    >
      {shelf.rows.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {shelf.rows.map((row) => (
            <ShelfRow key={row.key} row={row} printingsById={printingsById} />
          ))}
        </ul>
      ) : null}
    </ActionBand>
  );
}
