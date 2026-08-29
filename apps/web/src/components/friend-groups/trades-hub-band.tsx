import type { FriendGroupDetailResponse } from "@openrift/shared";
import { needsViewerAction } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ZapIcon } from "lucide-react";

import { CardArtThumbStack } from "@/components/cards/card-art-thumb-stack";
import { ActionBand } from "@/components/ui/action-band";
import { buttonVariants } from "@/components/ui/button";
import { useGroupTrades, useUserTrades } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";
import { frontImageId } from "@/lib/card-meta";
import { withoutLiveTradeMatches } from "@/lib/trade-derivation";
import type { TradeShelfRow } from "@/lib/trade-hub";
import { buildTradeShelf } from "@/lib/trade-hub";
import { cn } from "@/lib/utils";

/** How many thumbs a row shows before the rest collapse into the "+N" pill. */
const MAX_THUMBS = 5;

/**
 * One shelf row: what the cards are, the cards themselves, and the sentence
 * saying how many of what and with whom.
 *
 * The count lives in the sentence rather than beside the strip, because the
 * strip is deduplicated to distinct printings and the two numbers legitimately
 * differ (several members can offer the same card).
 * @returns The row element.
 */
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
          "text-xs font-semibold tracking-wide uppercase sm:w-32 sm:shrink-0",
          row.tone === "gold"
            ? "text-amber-700 dark:text-amber-400"
            : "text-green-700 dark:text-green-500",
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

/**
 * The overview's trades band: one row per thing actually going on, each showing
 * the cards behind it.
 *
 * Rows are drawn only when they have something in them, so a quiet group is a
 * headline and nothing else rather than a grid of zeros, and every count is
 * spoken with the noun it counts. The whole band is the link to the group's
 * Trades page, where each person's pile is worked through — so nothing inside
 * the band is interactive, and the CTA is decoration on the band's own anchor.
 * @returns The trades band.
 */
export function TradesHubBand({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: allTradesData } = useUserTrades();
  const { printingsById } = useCards();

  const trades = tradesData?.items ?? [];
  // Suggestions already covered by a live trade in any group are not
  // opportunities any more (falling back to this group's own trades until the
  // all-groups list loads).
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
      tone={needsAction ? "gold" : shelf.rows.length > 0 ? "green" : "neutral"}
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
