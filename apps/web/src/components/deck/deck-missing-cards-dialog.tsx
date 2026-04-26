import type { Marketplace } from "@openrift/shared";
import { CheckIcon, CopyIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CardOwnership } from "@/hooks/use-deck-ownership";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { formatterForMarketplace } from "@/lib/format";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";

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
  /**
   * "missing" (default) frames the list as cards the viewer still needs;
   * "prices" drops the ownership framing for anonymous viewers and shows
   * the same rows as a price breakdown for the whole deck.
   */
  mode?: "missing" | "prices";
}

export function DeckMissingCardsDialog({
  open,
  onOpenChange,
  missingCards,
  totalMissingValue,
  marketplace,
  mode = "missing",
}: DeckMissingCardsDialogProps) {
  const [copied, setCopied] = useState(false);
  const fmt = formatterForMarketplace(marketplace);
  const meta = MARKETPLACE_META[marketplace];

  const sorted = missingCards.toSorted((a, b) => {
    const zoneCmp = (ZONE_LABELS[a.zone] ?? a.zone).localeCompare(ZONE_LABELS[b.zone] ?? b.zone);
    if (zoneCmp !== 0) {
      return zoneCmp;
    }
    return a.cardName.localeCompare(b.cardName);
  });

  const groupedByZone = [...Map.groupBy(sorted, (card) => card.zone).entries()];

  // Fetch marketplace source metadata only when the dialog is open, so we don't
  // send the extra request until the user actually needs the deep-link URLs.
  const printingIds = open
    ? sorted.flatMap((card) => (card.displayPrinting ? [card.displayPrinting.id] : []))
    : [];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const linkFor = (card: CardOwnership): string => {
    const printing = card.displayPrinting;
    const info = printing ? marketplaceInfo?.infos[printing.id]?.[marketplace] : undefined;
    if (printing && info?.available && info.productId !== null) {
      return meta.productUrl(info.productId, printing.language);
    }
    return meta.searchUrl(card.cardName);
  };

  const handleCopy = async () => {
    const lines = sorted.map((card) => {
      const code = card.displayPrinting?.shortCode;
      const namePart = code ? `${code} ${card.cardName}` : card.cardName;
      const price =
        card.displayPrice === undefined ? "" : ` - ${fmt(card.displayPrice * card.shortfall)}`;
      return `${card.shortfall}x ${namePart}${price}`;
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
          <DialogTitle>
            {mode === "prices"
              ? `Card prices (${totalMissing})`
              : `Missing cards (${totalMissing})`}
          </DialogTitle>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <img src={meta.icon} alt="" className="h-3 invert dark:invert-0" />
            Prices from {meta.label}
          </div>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-background sticky top-0 text-left text-xs">
              <tr>
                <th className="pb-2 font-medium">Printing</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Cost</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            {groupedByZone.map(([zone, cards]) => (
              <tbody key={zone}>
                <tr>
                  <th
                    colSpan={4}
                    className="text-muted-foreground bg-muted/40 border-t px-2 py-1 text-left font-medium"
                  >
                    {ZONE_LABELS[zone] ?? zone}
                  </th>
                </tr>
                {cards.map((card) => (
                  <tr key={`${card.cardId}:${card.zone}`} className="border-t">
                    <td className="py-1.5">
                      <a
                        href={linkFor(card)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground underline decoration-dotted underline-offset-2"
                      >
                        <span className="text-muted-foreground mr-2 font-mono">
                          {card.displayPrinting?.shortCode ?? "--"}
                        </span>
                        {card.cardName}
                      </a>
                      {card.locked > 0 && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="text-muted-foreground ml-1.5 inline-flex items-center align-middle" />
                            }
                          >
                            <LockIcon className="size-3" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-56 text-xs">
                            You have {card.locked} {card.locked === 1 ? "copy" : "copies"} in a
                            collection that&apos;s excluded from deck building.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                    <td className="py-1.5 text-right">{card.shortfall}</td>
                    <td className="text-muted-foreground py-1.5 text-right">
                      {card.displayPrice === undefined ? "--" : fmt(card.displayPrice)}
                    </td>
                    <td className="py-1.5 text-right">
                      {card.displayPrice === undefined
                        ? "--"
                        : fmt(card.displayPrice * card.shortfall)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        {totalMissingValue !== undefined && (
          <div className="text-muted-foreground flex items-center justify-between border-t pt-2 text-sm">
            <span>Total</span>
            <span className="text-foreground font-medium">{fmt(totalMissingValue)}</span>
          </div>
        )}

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
