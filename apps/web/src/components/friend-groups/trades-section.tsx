import type { CardTradeResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import {
  useAcceptTrade,
  useApplyTradeSync,
  useCancelTrade,
  useCompleteTrade,
  useDeclineTrade,
  useGroupTrades,
  useSkipTradeSync,
} from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { tradeSection, tradeStatusLabel } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useTradeActionStore } from "@/stores/trade-action-store";

import { SECTION_HEADING } from "./friend-group-shell";

/**
 * One trade as a wide row with a contextual action set.
 * @returns The trade row element.
 */
function TradeRow({ trade }: { trade: CardTradeResponse }) {
  const { cardsById, printingsById } = useCards();
  const acting = useTradeActionStore((state) => state.pending.has(trade.id));
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);

  const accept = useAcceptTrade();
  const decline = useDeclineTrade();
  const cancel = useCancelTrade();
  const complete = useCompleteTrade();
  const applySync = useApplyTradeSync();
  const skipSync = useSkipTradeSync();

  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const imageId = printing?.images.find((image) => image.face === "front")?.imageId ?? null;

  const incoming = trade.role === "receiver";
  const DirectionIcon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  const counterpartyName = trade.counterparty.nickname ?? trade.counterparty.name ?? "Member";

  function run<TVariables>(
    mutation: { mutate: (variables: TVariables, options?: { onSettled?: () => void }) => void },
    variables: TVariables,
  ): void {
    begin(trade.id);
    mutation.mutate(variables, { onSettled: () => settle(trade.id) });
  }

  const actionArgs = { tradeId: trade.id, groupSlug: trade.groupSlug };

  return (
    <div className="bg-card flex items-center gap-3 rounded-md border p-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          incoming
            ? "bg-green-500/10 text-green-600 dark:text-green-500"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-500",
        )}
        title={incoming ? "Comes to you" : "Goes to them"}
        aria-label={incoming ? "Comes to you" : "Goes to them"}
      >
        <DirectionIcon className="size-4" />
      </span>

      <div className="bg-muted relative aspect-[5/7] w-10 shrink-0 overflow-hidden rounded">
        {imageId ? (
          <img
            src={imageUrl(imageId, "120w")}
            alt={cardName}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">
          {trade.quantity}× {cardName}
        </span>
        <span className="text-muted-foreground text-xs">
          {incoming ? "From" : "To"} {counterpartyName}
        </span>
      </div>

      <UserAvatar
        image={trade.counterparty.image}
        name={trade.counterparty.name}
        gravatarHash={trade.counterparty.gravatarHash}
        size="sm"
      />

      <Badge variant="secondary" className="shrink-0">
        {tradeStatusLabel(trade.status)}
      </Badge>

      <div className="flex shrink-0 items-center gap-1.5">
        {trade.actionNeeded === "accept-or-decline" ? (
          <>
            <Button size="sm" disabled={acting} onClick={() => run(accept, actionArgs)}>
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => run(decline, actionArgs)}
            >
              Decline
            </Button>
          </>
        ) : null}

        {trade.actionNeeded === "cancel" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() => run(cancel, actionArgs)}
          >
            Cancel
          </Button>
        ) : null}

        {trade.actionNeeded === "complete" ? (
          <>
            <Button size="sm" disabled={acting} onClick={() => run(complete, actionArgs)}>
              Mark traded
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => run(cancel, actionArgs)}
            >
              Cancel
            </Button>
          </>
        ) : null}

        {trade.actionNeeded === "apply-sync" ? (
          <>
            <Button size="sm" disabled={acting} onClick={() => run(applySync, actionArgs)}>
              {incoming ? "Add to my collection" : "Update my collection"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={acting}
              onClick={() => run(skipSync, actionArgs)}
            >
              Skip
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function TradeGroup({ heading, trades }: { heading: string; trades: CardTradeResponse[] }) {
  if (trades.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_HEADING}>{heading}</h3>
      <div className="flex flex-col gap-2">
        {trades.map((trade) => (
          <TradeRow key={trade.id} trade={trade} />
        ))}
      </div>
    </section>
  );
}

interface TradesSectionProps {
  groupId: string;
}

/**
 * The viewer's trades in this group, bucketed into Action needed / In progress /
 * Completed. Rendered below the Possible trades section on the Trades page, so
 * the empty-state copy can point the viewer back up to the suggestions.
 * @returns The trades content.
 */
export function TradesSection({ groupId }: TradesSectionProps) {
  const { data } = useGroupTrades(groupId);

  const trades = data?.items ?? [];

  if (trades.length === 0) {
    return (
      <p className="text-muted-foreground">
        No trades in this group yet. When you request one of the suggestions above, it&apos;ll show
        up here.
      </p>
    );
  }

  const actionNeeded = trades.filter((trade) => tradeSection(trade) === "action-needed");
  const active = trades.filter((trade) => tradeSection(trade) === "active");
  const history = trades.filter((trade) => tradeSection(trade) === "history");

  return (
    <div className="flex flex-col gap-8">
      <TradeGroup heading="Action needed" trades={actionNeeded} />
      <TradeGroup heading="In progress" trades={active} />
      <TradeGroup heading="Completed" trades={history} />
    </div>
  );
}
