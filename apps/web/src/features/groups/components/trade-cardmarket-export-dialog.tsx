import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";
import { legendDisplayName } from "@openrift/shared/utils";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/features/cards/hooks/use-cards";
import { CopyTextButton } from "@/features/groups/components/copy-text-button";
import { formatCardmarketWants } from "@/features/lists/lib/list-export";

interface TradeCardmarketExportDialogProps {
  counterpartyName: string | null;
  trades: readonly CardTradeResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
 * Blocks are pure `Nx Card Name` lines with no prices or printing markers,
 * pastable directly into Cardmarket's shopping wizard.
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
