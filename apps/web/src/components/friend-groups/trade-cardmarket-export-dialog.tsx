import type { CardTradeResponse } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import { CopyTextButton } from "@/components/share/copy-text-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { formatCardmarketWants } from "@/lib/list-export";

interface TradeCardmarketExportDialogProps {
  counterpartyName: string | null;
  /** The reserved trades with this counterparty (both directions). */
  trades: readonly CardTradeResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One direction of the trade as a Cardmarket-ready text block with its own
 * copy button, so each side can be pasted into the shopping wizard separately.
 * @returns The labeled textarea block, or null when the direction is empty.
 */
function DirectionBlock({ heading, text }: { heading: string; text: string }) {
  if (text.length === 0) {
    return null;
  }

  const lineCount = text.split("\n").length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{heading}</h3>
        <CopyTextButton label="Copy" getText={() => text} size="sm" />
      </div>
      <Textarea
        readOnly
        value={text}
        className="field-sizing-fixed font-mono text-xs"
        rows={Math.min(Math.max(lineCount, 2), 8)}
        onClick={(event) => (event.target as HTMLTextAreaElement).select()}
      />
    </div>
  );
}

/**
 * Exports a counterparty's reserved trades as Cardmarket-ready want lists, one
 * block per direction. The blocks are pure `Nx Card Name` lines (no prices, no
 * printing markers) so they paste straight into Cardmarket's shopping wizard,
 * where the actual pricing happens with the user's own seller filters.
 * @returns The export dialog.
 */
export function TradeCardmarketExportDialog({
  counterpartyName,
  trades,
  open,
  onOpenChange,
}: TradeCardmarketExportDialogProps) {
  const { cardsById } = useCards();

  const wantsFor = (role: CardTradeResponse["role"]): string =>
    formatCardmarketWants(
      trades
        .filter((trade) => trade.role === role)
        .map((trade) => {
          const card = cardsById[trade.cardId];
          return { name: card ? legendDisplayName(card) : "", quantity: trade.quantity };
        })
        // A trade for a card missing from the catalog (shouldn't happen) would
        // otherwise emit an empty line that breaks the Cardmarket import.
        .filter((want) => want.name.length > 0),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export for Cardmarket</DialogTitle>
          <DialogDescription>
            Your agreed trades with {counterpartyName ?? "this member"} as plain card lists, ready
            for Cardmarket&apos;s shopping wizard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          <DirectionBlock heading="You give" text={wantsFor("giver")} />
          <DirectionBlock heading="You get" text={wantsFor("receiver")} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
