import type { CardTradeResponse } from "@openrift/shared";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useEnumOrders } from "@/hooks/use-enums";
import { tradeSection } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useTradeActionStore } from "@/stores/trade-action-store";

import { AddToCollectionDialog } from "./add-to-collection-dialog";
import { SECTION_HEADING } from "./friend-group-shell";
import {
  CardMetaLine,
  CounterpartyChip,
  TradeDirectionIcon,
  TradeExpiry,
  TradeStatusBadge,
} from "./trade-row-parts";

/**
 * One trade as a wide row with a contextual action set.
 * @returns The trade row element.
 */
function TradeRow({ trade }: { trade: CardTradeResponse }) {
  const { cardsById, printingsById } = useCards();
  const { labels } = useEnumOrders();
  const acting = useTradeActionStore((state) => state.pending.has(trade.id));
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);
  const [addOpen, setAddOpen] = useState(false);

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
  // A pending trade awaiting the viewer's accept/decline is "Your decision", not
  // "Waiting for them". Only the "Waiting for {name}" badge names the member, so
  // the chip drops its name there to avoid printing it twice in a row.
  const awaitingViewer = trade.actionNeeded === "accept-or-decline";
  const badgeNamesCounterparty = trade.status === "pending" && !awaitingViewer;

  function run<TVariables>(
    mutation: { mutate: (variables: TVariables, options?: { onSettled?: () => void }) => void },
    variables: TVariables,
  ): void {
    begin(trade.id);
    mutation.mutate(variables, { onSettled: () => settle(trade.id) });
  }

  const actionArgs = { tradeId: trade.id, groupSlug: trade.groupSlug };

  return (
    // On phones the row stacks: the card identity (with the member chip) sits on
    // top, and an action bar below carries the status badge on the left and the
    // buttons on the right. From sm up both groups dissolve (sm:contents) back
    // into one horizontal row.
    <div className="bg-card flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-3 sm:contents">
        <TradeDirectionIcon incoming={incoming} />

        <CardArtThumb imageId={imageId} alt={cardName} className="w-10" loading="lazy" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">
            {trade.quantity}× {cardName}
          </span>
          {printing ? (
            <CardMetaLine
              shortCode={printing.shortCode}
              rarity={printing.rarity}
              rarityLabel={labels.rarities[printing.rarity]}
              finish={printing.finish}
              finishLabel={labels.finishes[printing.finish]}
            />
          ) : null}
        </div>

        <CounterpartyChip
          groupSlug={trade.groupSlug}
          userId={trade.counterparty.userId}
          name={trade.counterparty.name}
          image={trade.counterparty.image}
          gravatarHash={trade.counterparty.gravatarHash}
          hideName={badgeNamesCounterparty}
        />
      </div>

      <div className="flex items-center gap-2 sm:contents">
        <TradeStatusBadge
          status={trade.status}
          counterpartyName={trade.counterparty.name}
          awaitingViewer={awaitingViewer}
        />

        <TradeExpiry status={trade.status} expiresAt={trade.expiresAt} />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          {trade.actionNeeded === "accept-or-decline" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => run(decline, actionArgs)}
              >
                Decline
              </Button>
              <Button size="sm" disabled={acting} onClick={() => run(accept, actionArgs)}>
                Accept
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
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => run(cancel, actionArgs)}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={acting} onClick={() => run(complete, actionArgs)}>
                Mark traded
              </Button>
            </>
          ) : null}

          {trade.actionNeeded === "apply-sync" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => run(skipSync, actionArgs)}
              >
                Skip
              </Button>
              {incoming ? (
                <Button size="sm" disabled={acting} onClick={() => setAddOpen(true)}>
                  Add to my collection
                </Button>
              ) : (
                <Button size="sm" disabled={acting} onClick={() => run(applySync, actionArgs)}>
                  Remove from my collection
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {incoming && trade.actionNeeded === "apply-sync" ? (
        <AddToCollectionDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          tradeId={trade.id}
          groupSlug={trade.groupSlug}
          cardName={cardName}
          quantity={trade.quantity}
        />
      ) : null}
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

/**
 * Completed trades, collapsed by default behind a clickable heading. History
 * accrues and rarely needs acting on, so it stays out of the way until the
 * viewer expands it.
 * @returns The collapsible completed group, or null when empty.
 */
function CompletedTradeGroup({ trades }: { trades: CardTradeResponse[] }) {
  if (trades.length === 0) {
    return null;
  }
  return (
    <Collapsible defaultOpen={false} className="flex flex-col gap-3">
      <h3>
        <CollapsibleTrigger
          className={cn(
            SECTION_HEADING,
            "hover:text-foreground flex w-full items-center gap-2 text-left transition-colors",
          )}
        >
          <ChevronDownIcon className="size-4 shrink-0 transition-transform data-[panel-open]:rotate-180" />
          Completed
          <span className="text-xs">({trades.length})</span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent>
        <div className="flex flex-col gap-2">
          {trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface TradesSectionProps {
  groupId: string;
  /**
   * The "Possible trades" suggestions block, injected between the active trade
   * buckets (In progress / Action needed) and the wishlists & tradelists so the
   * page reads In progress → Action needed → Possible trades → Wishlists &
   * tradelists → Completed.
   */
  suggestions: React.ReactNode;
  /**
   * The "Wishlists & tradelists" browse block (each member's shared wishlists
   * and tradelists), slotted just below the suggestions so the Trades page is the
   * one-stop place to both act on matches and browse what members offer.
   */
  memberLists: React.ReactNode;
}

/**
 * The viewer's trades in this group, bucketed into In progress / Action needed /
 * Completed, with the Possible trades suggestions and Wishlists & tradelists slotted in
 * just above Completed. The active work the viewer can act on stays at the top.
 * @returns The trades content.
 */
export function TradesSection({ groupId, suggestions, memberLists }: TradesSectionProps) {
  const { data } = useGroupTrades(groupId);

  const trades = data?.items ?? [];

  if (trades.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {suggestions}
        {memberLists}
        <p className="text-muted-foreground">
          No trades in this group yet. When you request one of the suggestions above, it&apos;ll
          show up here.
        </p>
      </div>
    );
  }

  const actionNeeded = trades.filter((trade) => tradeSection(trade) === "action-needed");
  const active = trades.filter((trade) => tradeSection(trade) === "active");
  const history = trades.filter((trade) => tradeSection(trade) === "history");

  return (
    <div className="flex flex-col gap-8">
      <TradeGroup heading="In progress" trades={active} />
      <TradeGroup heading="Action needed" trades={actionNeeded} />
      {suggestions}
      {memberLists}
      <CompletedTradeGroup trades={history} />
    </div>
  );
}
