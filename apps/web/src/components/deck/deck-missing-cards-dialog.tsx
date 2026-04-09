import type { Marketplace } from "@openrift/shared";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CardOwnership } from "@/hooks/use-deck-ownership";
import { formatterForMarketplace } from "@/lib/format";

const ZONE_LABELS: Record<string, string> = {
  legend: "Legend",
  champion: "Champion",
  runes: "Runes",
  battlefield: "Battlefields",
  main: "Main",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

interface DeckMissingCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingCards: CardOwnership[];
  totalMissingValue: number | undefined;
  marketplace: Marketplace;
}

export function DeckMissingCardsDialog({
  open,
  onOpenChange,
  missingCards,
  totalMissingValue,
  marketplace,
}: DeckMissingCardsDialogProps) {
  const [copied, setCopied] = useState(false);
  const fmt = formatterForMarketplace(marketplace);

  const sorted = missingCards.toSorted((a, b) => {
    const zoneCmp = (ZONE_LABELS[a.zone] ?? a.zone).localeCompare(ZONE_LABELS[b.zone] ?? b.zone);
    if (zoneCmp !== 0) {
      return zoneCmp;
    }
    return a.cardName.localeCompare(b.cardName);
  });

  const handleCopy = async () => {
    const lines = sorted.map((card) => {
      const price =
        card.cheapestPrice === undefined ? "" : ` - ${fmt(card.cheapestPrice * card.shortfall)}`;
      return `${card.shortfall}x ${card.cardName}${price}`;
    });
    // Use \r\n so line breaks survive iOS Safari's clipboard
    const text = lines.join("\r\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalMissing = sorted.reduce((sum, card) => sum + card.shortfall, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>Missing cards ({totalMissing})</span>
            {totalMissingValue !== undefined && (
              <span className="text-muted-foreground text-sm font-normal">
                {fmt(totalMissingValue)}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-background sticky top-0 text-left text-xs">
              <tr>
                <th className="pb-2 font-medium">Card</th>
                <th className="pb-2 text-center font-medium">Zone</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((card) => (
                <tr key={`${card.cardId}:${card.zone}`} className="border-t">
                  <td className="py-1.5">{card.cardName}</td>
                  <td className="text-muted-foreground py-1.5 text-center text-xs">
                    {ZONE_LABELS[card.zone] ?? card.zone}
                  </td>
                  <td className="py-1.5 text-right">{card.shortfall}</td>
                  <td className="text-muted-foreground py-1.5 text-right">
                    {card.cheapestPrice === undefined
                      ? "--"
                      : fmt(card.cheapestPrice * card.shortfall)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <CheckIcon className="size-3.5" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                Copy to clipboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
