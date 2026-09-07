import { enumLabel } from "@openrift/shared/enum-label";
import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";
import { getOrientation } from "@openrift/shared/utils";
import { useQueryClient } from "@tanstack/react-query";
import { EllipsisVerticalIcon, HandshakeIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { SectionHeading } from "@/components/ui/section-heading";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { CardDetailNameButton } from "@/features/cards/components/card-detail-opener";
import { useCards } from "@/features/cards/hooks/use-cards";
import { frontImageId } from "@/features/cards/lib/card-meta";
import { TradeAddTargetDialog } from "@/features/groups/components/trade-add-target-dialog";
import { TradeSettleCopyPickerDialog } from "@/features/groups/components/trade-copy-picker-dialog";
import { TradeRow } from "@/features/groups/components/trade-row";
import {
  CardMetaLine,
  TradeDirectionIcon,
  TradeEstimatedPrice,
} from "@/features/groups/components/trade-row-parts";
import {
  tradeCopyOptionsQueryOptions,
  useApplyTradeSync,
} from "@/features/groups/hooks/use-card-trades";
import { useTradeAddTarget } from "@/features/groups/hooks/use-trade-add-target";
import type {
  PendingSettleChoice,
  SettleBatchResult,
  SettleStep,
} from "@/features/groups/lib/trade-settle-batch";
import { runSettleBatch } from "@/features/groups/lib/trade-settle-batch";
import { stepSequence } from "@/features/groups/lib/trade-sheet";
import { talliedCount, useTradeTallyStore } from "@/features/groups/stores/trade-tally-store";
import { useEnumOrders } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";
import { languageNameForCode } from "@/lib/language-names";

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
          {/* The quantity rides inside the button: a nested inline-block clips without an ellipsis. */}
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
            rarityLabel={enumLabel(labels.rarities, printing.rarity)}
            finish={printing.finish}
            finishLabel={enumLabel(labels.finishes, printing.finish)}
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

export function TradeSettleSection({
  trades,
  showGroupLabels,
}: {
  trades: CardTradeResponse[];
  showGroupLabels: boolean;
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
    // The tally store is keyed by trade id across every counterparty, so only
    // clear counts for rows this section actually shows.
    clearCounts(trades.filter((trade) => counts[trade.id] !== undefined).map((trade) => trade.id));
  }

  function finishBatch(result: SettleBatchResult): void {
    // A row waiting on a copy choice keeps its tally; the picker settles with it.
    clearCounts(result.settledTradeIds);
    setPendingChoices(result.pendingChoices);
    setBusy(false);
    if (result.failed) {
      // The global mutation toast won't fire: this batch partially succeeded.
      toast.warning("Some cards could not be settled. The rest went through.");
    }
  }

  function commit(): void {
    setBusy(true);
    void (async () => {
      const result = await runSettleBatch(steps, {
        settle: (variables) => applySync.mutateAsync(variables),
        readCopyOptions: (tradeId) =>
          copyOptionsOrNull(() => queryClient.query(tradeCopyOptionsQueryOptions(userId, tradeId))),
        targetCollectionId: target.collectionId,
      });
      finishBatch(result);
    })();
  }

  const choice = pendingChoices[0];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading icon={HandshakeIcon} tone="success" count={trades.length}>
          Ready to swap
        </SectionHeading>
        {session ? null : hasSavedCount ? (
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
        // No overflow-hidden here: it would trap the sticky footer below
        // inside this panel's own scroll box.
        <div className="bg-card border-success/30 rounded-xl border">
          <div className="bg-success-soft flex flex-wrap items-center justify-between gap-2 rounded-t-xl px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">Counting cards</span>
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
                  {/* "Done for now" leaves the panel keeping the tally; this discards it instead. */}
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

          {/* Opaque background: this slides over the rows' art as it sticks. */}
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
              groupLabel={showGroupLabels ? trade.groupName : undefined}
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
                  groupSlug: choice.trade.groupSlug ?? undefined,
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
              // Leaves the row reserved with its tally intact for the next pass.
              setPendingChoices((rest) => rest.slice(1));
            },
          }}
          cardName={cardsById[choice.trade.cardId]?.name ?? "this card"}
        />
      )}
    </section>
  );
}
