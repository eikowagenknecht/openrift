import type { CardTradeCopyOptionsResponse, CardTradeResponse } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { EllipsisVerticalIcon, HandshakeIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailNameButton } from "@/components/cards/card-detail-opener";
import { TradeSettleCopyPickerDialog } from "@/components/friend-groups/trade-copy-picker-dialog";
import { TradeRow } from "@/components/friend-groups/trade-row";
import {
  CardMetaLine,
  TradeDirectionIcon,
  TradeEstimatedPrice,
} from "@/components/friend-groups/trade-row-parts";
import { TradeAddTargetDialog } from "@/components/trades/trade-add-target-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { SectionHeading } from "@/components/ui/section-heading";
import { tradeCopyOptionsQueryOptions, useApplyTradeSync } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useTradeAddTarget } from "@/hooks/use-trade-add-target";
import { useRequiredUserId } from "@/lib/auth-session";
import { frontImageId } from "@/lib/card-meta";
import { languageNameForCode } from "@/lib/language-names";
import type { PendingSettleChoice, SettleBatchResult, SettleStep } from "@/lib/trade-settle-batch";
import { runSettleBatch } from "@/lib/trade-settle-batch";
import { stepSequence } from "@/lib/trade-sheet";
import { talliedCount, useTradeTallyStore } from "@/stores/trade-tally-store";

/**
 * Reads a trade's candidate copies, turning a failure into "nothing to choose
 * between". The read refines the settle rather than gating it.
 * @returns The options, or null when the read failed.
 */
async function copyOptionsOrNull(
  read: () => Promise<CardTradeCopyOptionsResponse>,
): Promise<CardTradeCopyOptionsResponse | null> {
  try {
    return await read();
  } catch {
    // The global query error handling has already reported it.
    return null;
  }
}

/**
 * One card in a running session, as the same two-line row the rest of the sheet
 * uses: only the slots differ. The status badge is gone (every row in this
 * section is ready to swap, and the count it would compete with is the whole
 * point of the session), the stepper takes the place the actions had, and the
 * meta line gains the language — with the card in your hand, the print run and
 * the language are what decide whether it is this row's card.
 * @returns The row element.
 */
function TallyRow({
  trade,
  sequence,
  disabled,
}: {
  trade: CardTradeResponse;
  sequence?: string[];
  disabled: boolean;
}) {
  const { cardsById, printingsById } = useCards();
  const { labels } = useEnumOrders();
  const counts = useTradeTallyStore((state) => state.counts);
  const setCount = useTradeTallyStore((state) => state.setCount);

  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const count = talliedCount(counts, trade.id, trade.quantity);

  return (
    <li className="flex items-center gap-3 py-2">
      <TradeDirectionIcon incoming={trade.role === "receiver"} />
      <CardArtThumb
        shape="strip"
        imageId={frontImageId(printing)}
        alt={cardName}
        landscape={card ? getOrientation(card.types) === "landscape" : false}
        rarity={printing?.rarity}
        domains={card?.domains}
        className="h-10"
        loading="lazy"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {/* Same truncation rule as the ordinary row: the quantity rides inside
              the button, because a nested inline-block clips without an
              ellipsis. */}
          <CardDetailNameButton
            printingId={printing?.id}
            sequence={sequence}
            className="min-w-0 truncate font-medium"
          >
            {trade.quantity}× {cardName}
          </CardDetailNameButton>
          <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
            <TradeEstimatedPrice printingId={trade.printingId} quantity={trade.quantity} />
          </span>
        </div>

        {printing ? (
          <CardMetaLine
            shortCode={printing.shortCode}
            rarity={printing.rarity}
            rarityLabel={labels.rarities[printing.rarity]}
            finish={printing.finish}
            finishLabel={labels.finishes[printing.finish]}
            trailing={
              <span className="text-muted-foreground">
                · {languageNameForCode(printing.language)}
              </span>
            }
          />
        ) : null}
      </div>
      <QuantityStepper
        value={count}
        onValueChange={(next) => setCount(trade.id, next)}
        min={0}
        max={trade.quantity}
        disabled={disabled}
      />
    </li>
  );
}

/**
 * What the commit is about to do to the viewer's collection, in the two terms
 * it can be wrong in: how many cards land somewhere, and how many leave. The
 * landing place is a button, because it is the one part of the sentence that is
 * a choice — and the only place left to make it, now that settling is a batch.
 * @returns The summary line, or null when nothing is tallied.
 */
function CommitSummary({
  incomingCards,
  outgoingCards,
  targetLabel,
  onChangeTarget,
}: {
  incomingCards: number;
  outgoingCards: number;
  targetLabel: string;
  onChangeTarget: () => void;
}) {
  if (incomingCards === 0 && outgoingCards === 0) {
    return null;
  }
  return (
    <p className="text-muted-foreground min-w-0 text-xs">
      {incomingCards > 0 ? (
        <>
          Adds {incomingCards} to{" "}
          <Button variant="link-muted" size="sm" className="h-auto p-0" onClick={onChangeTarget}>
            {targetLabel}
          </Button>
        </>
      ) : null}
      {incomingCards > 0 && outgoingCards > 0 ? " · " : null}
      {outgoingCards > 0 ? `Removes ${outgoingCards} from your collection` : null}
    </p>
  );
}

/**
 * The trade sheet's settle section: the swaps the two of you have agreed and
 * not yet exchanged.
 *
 * Out of session it is an ordinary ledger section — the rows read like every
 * other row on the page, and the only settle-shaped thing on it is the button
 * that starts a session. In session the rows become a tally: card by card, say
 * how many actually turned up, and one commit settles exactly that much across
 * both directions at once. Whatever is left at 0 keeps its trade open for the
 * next meet-up.
 *
 * Nothing in a session reaches the server until the commit button is pressed,
 * and the tally survives a reload. A saved count never puts the page straight
 * back into a session though: arriving on the sheet is usually about something
 * else entirely, and a page that opens counting is a page you have to back out
 * of. The count instead offers itself in the heading row, to resume or discard.
 * @returns The section element.
 */
export function TradeSettleSection({
  trades,
  groupNames,
}: {
  /** The swaps with this person the viewer can still settle, across every shared group. */
  trades: CardTradeResponse[];
  /** Group names by id, or null while the two share only one group. */
  groupNames: ReadonlyMap<string, string> | null;
}) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const { cardsById } = useCards();
  const applySync = useApplyTradeSync();
  const target = useTradeAddTarget();
  const counts = useTradeTallyStore((state) => state.counts);
  const clearCounts = useTradeTallyStore((state) => state.clearCounts);

  const [session, setSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [pendingChoices, setPendingChoices] = useState<PendingSettleChoice[]>([]);

  const sequence = stepSequence(trades);
  const hasSavedCount = trades.some((trade) => counts[trade.id] !== undefined);
  const steps: SettleStep[] = trades.flatMap((trade) => {
    const quantity = talliedCount(counts, trade.id, trade.quantity);
    return quantity > 0 ? [{ trade, quantity }] : [];
  });
  const cards = steps.reduce((total, step) => total + step.quantity, 0);
  const rowsAtZero = trades.length - steps.length;
  const incomingCards = steps.reduce(
    (total, step) => total + (step.trade.role === "receiver" ? step.quantity : 0),
    0,
  );

  function discardCounts(): void {
    // Only the rows this section shows: the store is keyed by trade id across
    // every counterparty, so a count left on someone else's sheet is not ours
    // to throw away.
    clearCounts(trades.filter((trade) => counts[trade.id] !== undefined).map((trade) => trade.id));
  }

  function finishBatch(result: SettleBatchResult): void {
    // Only the rows that actually went through lose their tally. A row waiting
    // on a copy choice keeps its count, which is what the picker settles with.
    clearCounts(result.settledTradeIds);
    setPendingChoices(result.pendingChoices);
    setBusy(false);
    if (result.failed) {
      // Not the global mutation toast's job: some rows settled before this one
      // did not, and that partial progress is the thing worth saying.
      toast.warning("Some cards could not be settled. The rest went through.");
    }
  }

  function commit(): void {
    setBusy(true);
    void (async () => {
      const result = await runSettleBatch(steps, {
        settle: (variables) => applySync.mutateAsync(variables),
        readCopyOptions: (tradeId) =>
          copyOptionsOrNull(() =>
            queryClient.fetchQuery(tradeCopyOptionsQueryOptions(userId, tradeId)),
          ),
        targetCollectionId: target.collectionId,
      });
      finishBatch(result);
    })();
  }

  const choice = pendingChoices[0];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading icon={HandshakeIcon} tone="green" count={trades.length}>
          Ready to swap
        </SectionHeading>
        {session ? null : hasSavedCount ? (
          // An interrupted session left a count behind. It is only worth
          // something if the same pile of cards is still on the table, so the
          // strip offers both ways out rather than assuming either.
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">
              You started counting these earlier
            </span>
            <Button size="sm" onClick={() => setSession(true)}>
              Resume
            </Button>
            <Button variant="ghost" size="sm" onClick={discardCounts}>
              Discard
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setSession(true)}>
            <HandshakeIcon />
            Settle up
          </Button>
        )}
      </div>

      {session ? (
        // One bounded surface for the whole session: header, rows and commit
        // read as a thing you are inside of and can leave, which a bare list
        // with a floating button does not. No overflow-hidden — it would trap
        // the sticky footer inside the panel's own scroll box.
        <div className="bg-card rounded-xl border border-green-600/30 dark:border-green-500/25">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-green-500/10 px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">Counting cards</span>
              {/* The guarantee belongs where the session starts, not on the
                  commit button, so it is readable before anything is counted. */}
              <span className="text-muted-foreground text-xs">
                Nothing is saved until you settle
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setSession(false)}>
                Done for now
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label="More session actions"
                    />
                  }
                >
                  <EllipsisVerticalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Leaving keeps the count; this is the one way to say the
                      count itself is wrong and start over. */}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      discardCounts();
                      setSession(false);
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Discard count
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <ul className="divide-border divide-y px-3">
            {trades.map((trade) => (
              <TallyRow key={trade.id} trade={trade} sequence={sequence} disabled={busy} />
            ))}
          </ul>

          {/* The panel's bottom edge, which sticks: a pile long enough to
              scroll is exactly the pile whose commit button must stay in reach.
              Opaque, because it slides over the rows' art. */}
          <div className="bg-card pb-safe sticky bottom-0 z-20 flex flex-col gap-2 rounded-b-xl border-t px-3 pt-3">
            <CommitSummary
              incomingCards={incomingCards}
              outgoingCards={cards - incomingCards}
              targetLabel={target.label}
              onChangeTarget={() => setTargetOpen(true)}
            />
            <Button className="w-full" disabled={busy || cards === 0} onClick={commit}>
              Settle {cards} {cards === 1 ? "card" : "cards"}
            </Button>
            {rowsAtZero === 0 ? null : (
              <p className="text-muted-foreground text-center text-xs">
                {rowsAtZero} {rowsAtZero === 1 ? "swap" : "swaps"} left at 0, staying open for next
                time.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {trades.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              sequence={sequence}
              groupLabel={groupNames?.get(trade.groupId)}
              // The heading says it once for the whole section.
              redundantStatus="ready-to-swap"
            />
          ))}
        </div>
      )}

      <TradeAddTargetDialog open={targetOpen} onOpenChange={setTargetOpen} />

      {choice === undefined ? null : (
        <TradeSettleCopyPickerDialog
          flow={{
            choice: { options: choice.options, quantity: choice.quantity },
            settling: applySync.isPending,
            confirm: (copyIds) => {
              applySync.mutate(
                {
                  tradeId: choice.trade.id,
                  groupSlug: choice.trade.groupSlug,
                  quantity: choice.quantity,
                  copyIds,
                },
                {
                  onSettled: () => {
                    clearCounts([choice.trade.id]);
                    setPendingChoices((rest) => rest.slice(1));
                  },
                },
              );
            },
            cancel: () => {
              // Dropping the choice leaves the row reserved and its tally
              // intact, so it is still there to settle on the next pass.
              setPendingChoices((rest) => rest.slice(1));
            },
          }}
          cardName={cardsById[choice.trade.cardId]?.name ?? "this card"}
        />
      )}
    </section>
  );
}
