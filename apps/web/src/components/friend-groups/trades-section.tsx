import type { CardTradeResponse } from "@openrift/shared";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useEnumOrders } from "@/hooks/use-enums";
import { usePrices } from "@/hooks/use-prices";
import type { TradeCounterpartyGroup } from "@/lib/trade-derivation";
import { groupTradesByCounterparty, sumTradeValues, tradeSection } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useTradeActionStore } from "@/stores/trade-action-store";

import { AddToCollectionDialog } from "./add-to-collection-dialog";
import { SECTION_HEADING } from "./friend-group-shell";
import {
  CardMetaLine,
  CounterpartyChip,
  TradeDirectionIcon,
  TradeEstimatedPrice,
  TradeExpiry,
  TradeStatusBadge,
  TradeValueSummary,
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
    <Card className="gap-2 p-2 sm:flex-row sm:items-center sm:gap-3">
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
              trailing={
                <TradeEstimatedPrice printingId={trade.printingId} quantity={trade.quantity} />
              }
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
    </Card>
  );
}

/** Which bulk action a counterparty group offers, keyed to its lifecycle bucket:
 * accept/decline for the requests awaiting the viewer, cancel for the requests
 * the viewer sent, or none (completed history). */
type BulkMode = "accept-decline" | "cancel" | "none";

/**
 * The bulk action buttons on a counterparty group header. Acts on the trades in
 * this group whose contextual action matches the mode — accept/decline for
 * "Your move" requests, cancel for the viewer's own pending ones — firing one
 * mutation per trade and driving the shared action store so every affected row
 * shows its in-flight state. Renders nothing until there are at least two to act
 * on, since a lone trade is served fine by its own row button.
 * @returns The bulk-action buttons, or null when fewer than two apply.
 */
function BulkTradeActions({ trades, mode }: { trades: CardTradeResponse[]; mode: BulkMode }) {
  const accept = useAcceptTrade();
  const decline = useDeclineTrade();
  const cancel = useCancelTrade();
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);

  const needle = mode === "accept-decline" ? "accept-or-decline" : "cancel";
  const targets = trades.filter((trade) => trade.actionNeeded === needle);
  const acting = useTradeActionStore((state) =>
    targets.some((trade) => state.pending.has(trade.id)),
  );

  if (mode === "none" || targets.length < 2) {
    return null;
  }

  function runAll(mutation: {
    mutate: (
      variables: { tradeId: string; groupSlug?: string },
      options?: { onSettled?: () => void },
    ) => void;
  }): void {
    for (const trade of targets) {
      begin(trade.id);
      mutation.mutate(
        { tradeId: trade.id, groupSlug: trade.groupSlug },
        { onSettled: () => settle(trade.id) },
      );
    }
  }

  if (mode === "cancel") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={acting}
        onClick={() => runAll(cancel)}
      >
        Cancel all ({targets.length})
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button size="sm" variant="outline" disabled={acting} onClick={() => runAll(decline)}>
        Decline all
      </Button>
      <Button size="sm" disabled={acting} onClick={() => runAll(accept)}>
        Accept all ({targets.length})
      </Button>
    </div>
  );
}

/**
 * One counterparty's trades under a collapsible header: avatar, name, count, and
 * the estimated get/give value, with the bulk action for the bucket next to it.
 * Default-open so the rows are visible, but collapsible so a big pile from one
 * person can be folded away.
 * @returns The per-counterparty trade group.
 */
function CounterpartyTradeGroup({
  group,
  bulk,
}: {
  group: TradeCounterpartyGroup;
  bulk: BulkMode;
}) {
  const { counterparty, trades } = group;
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const split = sumTradeValues(trades, (printingId) => prices.get(printingId, marketplace));

  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="group hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium">
          <UserAvatar
            image={counterparty.image}
            name={counterparty.name}
            gravatarHash={counterparty.gravatarHash}
            size="sm"
          />
          <span className="truncate">{counterparty.name ?? "Member"}</span>
          <span className="text-muted-foreground shrink-0 text-xs">({trades.length})</span>
          <TradeValueSummary split={split} marketplace={marketplace} className="ml-auto" />
          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>
        <BulkTradeActions trades={trades} mode={bulk} />
      </div>
      <CollapsibleContent>
        <div className="mt-1 flex flex-col gap-2">
          {trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A lifecycle bucket (In progress / Action needed), its trades grouped per
 * counterparty so a pile of requests to one person reads as a single foldable
 * block with a running value and a bulk action.
 * @returns The bucket section, or null when empty.
 */
function CounterpartyGroupedBucket({
  heading,
  trades,
  bulk,
}: {
  heading: string;
  trades: CardTradeResponse[];
  bulk: BulkMode;
}) {
  if (trades.length === 0) {
    return null;
  }
  const groups = groupTradesByCounterparty(trades);
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_HEADING}>{heading}</h3>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <CounterpartyTradeGroup key={group.counterparty.userId} group={group} bulk={bulk} />
        ))}
      </div>
    </section>
  );
}

/**
 * Completed trades, collapsed by default behind a clickable heading and grouped
 * per counterparty inside. History accrues and rarely needs acting on, so it
 * stays out of the way until the viewer expands it.
 * @returns The collapsible completed group, or null when empty.
 */
function CompletedBucket({ trades }: { trades: CardTradeResponse[] }) {
  if (trades.length === 0) {
    return null;
  }
  const groups = groupTradesByCounterparty(trades);
  return (
    <Collapsible defaultOpen={false} className="flex flex-col gap-3">
      <h3>
        <CollapsibleTrigger
          className={cn(
            SECTION_HEADING,
            "group hover:text-foreground flex w-full items-center gap-2 text-left transition-colors",
          )}
        >
          <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
          Completed
          <span className="text-xs">({trades.length})</span>
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent>
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <CounterpartyTradeGroup key={group.counterparty.userId} group={group} bulk="none" />
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
      <CounterpartyGroupedBucket heading="In progress" trades={active} bulk="cancel" />
      <CounterpartyGroupedBucket
        heading="Action needed"
        trades={actionNeeded}
        bulk="accept-decline"
      />
      {suggestions}
      {memberLists}
      <CompletedBucket trades={history} />
    </div>
  );
}
