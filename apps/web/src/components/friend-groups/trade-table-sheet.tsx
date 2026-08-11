import type { CardTradeCopyOptionsResponse, CardTradeResponse, Printing } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { HandshakeIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailNameButton } from "@/components/cards/card-detail-opener";
import { TradeSettleCopyPickerDialog } from "@/components/friend-groups/trade-copy-picker-dialog";
import { CardMetaLine } from "@/components/friend-groups/trade-row-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { tradeCopyOptionsQueryOptions, useApplyTradeSync } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTradeAddTarget } from "@/hooks/use-trade-add-target";
import { useRequiredUserId } from "@/lib/auth-session";
import { frontImageId } from "@/lib/card-meta";
import { languageNameForCode } from "@/lib/language-names";
import type { PendingSettleChoice, SettleBatchResult } from "@/lib/trade-settle-batch";
import { runSettleBatch } from "@/lib/trade-settle-batch";
import { talliedCount, useTradeTallyStore } from "@/stores/trade-tally-store";

/** Which side of the swap the sheet is working through. */
type Direction = "incoming" | "outgoing";

/**
 * Reads a trade's candidate copies, turning a failure into "nothing to choose
 * between". The read refines the settle rather than gating it, the same
 * fallback the per-row button takes.
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
 * The identity fields you actually read off a physical card, in the order you
 * check them: which set and number, then how it is printed.
 * @returns The identity line, or null when the printing is not in the catalog.
 */
function PhysicalIdentity({ printing }: { printing: Printing | undefined }) {
  const { labels } = useEnumOrders();
  if (printing === undefined) {
    return null;
  }
  return (
    <CardMetaLine
      shortCode={printing.shortCode}
      rarity={printing.rarity}
      rarityLabel={labels.rarities[printing.rarity]}
      finish={printing.finish}
      finishLabel={labels.finishes[printing.finish]}
      trailing={
        <span className="text-muted-foreground">
          · {printing.publicCode} · {languageNameForCode(printing.language)}
        </span>
      }
    />
  );
}

/**
 * One card in the pile: big enough art to match against the physical card, the
 * fields that tell two printings apart, and how many of them turned up.
 * @returns The row element.
 */
function TableRow({
  trade,
  sequence,
  disabled,
}: {
  trade: CardTradeResponse;
  sequence?: string[];
  disabled: boolean;
}) {
  const { cardsById, printingsById } = useCards();
  const counts = useTradeTallyStore((state) => state.counts);
  const setCount = useTradeTallyStore((state) => state.setCount);

  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const count = talliedCount(counts, trade.id, trade.quantity);

  return (
    <li className="flex items-center gap-3 py-2">
      <CardArtThumb
        imageId={frontImageId(printing)}
        alt={cardName}
        variant="240w"
        className="w-16"
        loading="lazy"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <CardDetailNameButton
          printingId={printing?.id}
          sequence={sequence}
          className="max-w-full self-start truncate font-medium"
        >
          {cardName}
        </CardDetailNameButton>
        <PhysicalIdentity printing={printing} />
        <span className="text-muted-foreground text-xs">
          {count === trade.quantity ? `All ${trade.quantity}` : `${count} of ${trade.quantity}`}
        </span>
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
 * What the commit button says, so the count is on the button rather than
 * somewhere the eye has to hunt for it.
 * @returns The button label.
 */
function commitLabel(direction: Direction, cards: number, targetLabel: string): string {
  const noun = cards === 1 ? "card" : "cards";
  if (direction === "incoming") {
    return `Got them, add ${cards} ${noun} to ${targetLabel}`;
  }
  return `Handed over, remove ${cards} ${noun}`;
}

function TableSheetBody({
  trades,
  onDone,
}: {
  /** The counterparty's rows this viewer can still settle, in catalog order. */
  trades: CardTradeResponse[];
  onDone: () => void;
}) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const { cardsById } = useCards();
  const applySync = useApplyTradeSync();
  const target = useTradeAddTarget();
  const counts = useTradeTallyStore((state) => state.counts);
  const clearCounts = useTradeTallyStore((state) => state.clearCounts);

  const incoming = trades.filter((trade) => trade.role === "receiver");
  const outgoing = trades.filter((trade) => trade.role === "giver");
  const [direction, setDirection] = useState<Direction>(
    incoming.length > 0 ? "incoming" : "outgoing",
  );
  const [pendingChoices, setPendingChoices] = useState<PendingSettleChoice[]>([]);
  const [busy, setBusy] = useState(false);

  const shown = direction === "incoming" ? incoming : outgoing;
  const sequence = shown.map((trade) => trade.printingId);
  const steps = shown.flatMap((trade) => {
    const quantity = talliedCount(counts, trade.id, trade.quantity);
    return quantity > 0 ? [{ trade, quantity }] : [];
  });
  const cards = steps.reduce((total, step) => total + step.quantity, 0);

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
    if (result.pendingChoices.length === 0) {
      onDone();
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
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {incoming.length > 0 && outgoing.length > 0 ? (
          <ToggleGroup
            value={[direction]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "incoming" || next === "outgoing") {
                setDirection(next);
              }
            }}
            className="self-start"
          >
            <ToggleGroupItem value="incoming" disabled={busy}>
              They hand over ({incoming.length})
            </ToggleGroupItem>
            <ToggleGroupItem value="outgoing" disabled={busy}>
              You hand over ({outgoing.length})
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}

        <ul className="divide-border min-h-0 flex-1 divide-y overflow-y-auto">
          {shown.map((trade) => (
            <TableRow key={trade.id} trade={trade} sequence={sequence} disabled={busy} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Button className="w-full" disabled={busy || cards === 0} onClick={commit}>
          <span className="truncate">{commitLabel(direction, cards, target.label)}</span>
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          {steps.length === shown.length
            ? "Nothing is saved until you press the button."
            : `${shown.length - steps.length} left at 0, staying open for next time.`}
        </p>
      </div>

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
    </>
  );
}

/**
 * The at-the-table pass over one member's reserved trades: work down the pile
 * card by card, say how many of each actually turned up, and settle only that
 * much. Whatever is left keeps its trade open for the next meet-up.
 *
 * Everything above the commit button is local. The counts live in
 * `useTradeTallyStore` and never reach the server, which is the point: checking
 * the pile against what was agreed should not put anything in your collection.
 * @returns The sheet, as a fullscreen drawer on phones and a dialog above them.
 */
export function TradeTableSheet({
  open,
  onOpenChange,
  counterpartyName,
  trades,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterpartyName: string | null;
  trades: CardTradeResponse[];
}) {
  const isMobile = useIsMobile();
  const title = `Trading with ${counterpartyName ?? "this member"}`;
  const description = "Check off what actually changed hands, then settle that much.";
  const body = <TableSheetBody trades={trades} onDone={() => onOpenChange(false)} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="data-[swipe-direction=down]:h-[calc(100dvh-env(safe-area-inset-top,0px))] data-[swipe-direction=down]:max-h-none">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Opens the at-the-table pass for one member's block. Renders nothing unless
 * that block has trades this viewer can still settle, so it only appears once
 * there is a pile to check.
 * @returns The button and its sheet, or null.
 */
export function TradeTableSheetButton({
  counterpartyName,
  trades,
}: {
  counterpartyName: string | null;
  trades: CardTradeResponse[];
}) {
  const [open, setOpen] = useState(false);
  const settleable = trades.filter((trade) => trade.actionNeeded === "settle");

  if (settleable.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Trade with ${counterpartyName ?? "this member"} at the table`}
        title="At the table"
        onClick={() => setOpen(true)}
      >
        <HandshakeIcon />
      </Button>
      <TradeTableSheet
        open={open}
        onOpenChange={setOpen}
        counterpartyName={counterpartyName}
        trades={settleable}
      />
    </>
  );
}
