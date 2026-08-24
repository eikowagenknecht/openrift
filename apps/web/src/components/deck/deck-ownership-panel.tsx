import type { Marketplace } from "@openrift/shared";
import { PackageSearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { formatterForMarketplace } from "@/lib/format";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import { cn } from "@/lib/utils";

interface DeckOwnershipPanelProps {
  data: DeckOwnershipData;
  marketplace: Marketplace;
  onViewMissing: () => void;
}

/**
 * Owned/borrowed/missing/locked counts plus the price block and the missing-
 * cards button. Rendered by the deck import preview's summary panel, where the
 * figures have no other home. The deck editor deliberately does not use it: its
 * hero already carries the owned chip, the value breakdown and the missing-
 * cards entry point.
 * @returns The ownership breakdown.
 */
export function DeckOwnershipBody({ data, marketplace, onViewMissing }: DeckOwnershipPanelProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm">
        <Row label="Owned" value={`${data.totalOwned} / ${data.totalNeeded}`} />
        {data.totalBorrowed > 0 && (
          <Tooltip>
            <TooltipTrigger render={<div />}>
              <Row
                label="Borrowed"
                value={`${data.totalBorrowed} ${data.totalBorrowed === 1 ? "card" : "cards"}`}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              Copies you&apos;re borrowing from friends. They count as buildable while you have
              them, but they aren&apos;t part of your collection.
            </TooltipContent>
          </Tooltip>
        )}
        {data.missingCount > 0 && (
          <Row
            label="Missing"
            value={`${data.missingCount} ${data.missingCount === 1 ? "card" : "cards"}`}
          />
        )}
        {data.totalLocked > 0 && (
          <Tooltip>
            <TooltipTrigger render={<div />}>
              <Row
                label="Locked"
                value={`${data.totalLocked} ${data.totalLocked === 1 ? "card" : "cards"}`}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs">
              In collections excluded from deck building, so they don&apos;t count toward missing.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {data.deckValueCents !== undefined && <PriceBlock data={data} marketplace={marketplace} />}

      {data.missingCards.length > 0 && (
        <Button variant="outline" size="sm" className="w-full" onClick={onViewMissing}>
          <PackageSearchIcon className="size-3.5" />
          View missing cards
        </Button>
      )}
    </div>
  );
}

function Row({ label, value, indent }: { label: string; value: string; indent?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", indent && "pl-3 text-xs")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * What the deck costs, as one scope per line. The cost to complete is a second
 * column rather than a second set of lines: the scopes are the same three, and
 * stacking them twice made the block longer than everything above it. Its
 * heading rides on the marketplace line, which was already half empty, so the
 * column costs no row of its own.
 * @returns The price table.
 */
function PriceBlock({ data, marketplace }: { data: DeckOwnershipData; marketplace: Marketplace }) {
  const fmt = formatterForMarketplace(marketplace);
  // Nothing missing (or nothing priced) leaves the column empty, so it folds
  // away and the block reads as the plain value list it used to be.
  const showMissing = data.missingValueCents !== undefined && data.missingValueCents > 0;
  // Only worth splitting scopes once the sideboard actually costs something —
  // otherwise "Main deck" just repeats the total above it.
  const showSplit = data.sideboardValueCents !== undefined && data.sideboardValueCents > 0;
  // The cheapest-completion figure can undercut the creator's pinned printings.
  const showAsShown =
    showMissing &&
    data.missingAsDisplayedValueCents !== undefined &&
    data.missingValueCents !== undefined &&
    data.missingAsDisplayedValueCents > data.missingValueCents;

  return (
    <div
      className={cn(
        "grid items-center gap-x-3 gap-y-1 text-sm",
        showMissing ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]",
      )}
    >
      {/* Header row, one cell per column so the label sits over its own
          figures. Only the missing column needs naming — the row labels
          already say the first column is what the cards are worth. */}
      <div className="text-muted-foreground flex items-center gap-1.5 pb-0.5 text-xs">
        <img src={MARKETPLACE_META[marketplace].icon} alt="" className="h-3 invert dark:invert-0" />
        {MARKETPLACE_META[marketplace].label} prices
      </div>
      <span />
      {showMissing && (
        <span className="text-muted-foreground pb-0.5 text-right text-xs">missing</span>
      )}

      <PriceRow
        label="Deck value"
        value={fmt(data.deckValueCents)}
        missing={showMissing ? fmt(data.missingValueCents) : undefined}
      />
      {showSplit && (
        <>
          <PriceRow
            label="Main deck"
            value={fmt(data.mainValueCents)}
            missing={showMissing ? fmt(data.missingMainValueCents) : undefined}
            indent
          />
          <PriceRow
            label="Sideboard"
            value={fmt(data.sideboardValueCents)}
            missing={showMissing ? fmt(data.missingSideboardValueCents) : undefined}
            indent
          />
        </>
      )}
      {showAsShown && (
        <PriceRow label="As shown" missing={fmt(data.missingAsDisplayedValueCents)} indent />
      )}
    </div>
  );
}

/**
 * One scope of the price table. Cells are direct grid children, so every row's
 * figures line up in the same columns whatever the row omits.
 * @returns The row's cells.
 */
function PriceRow({
  label,
  value,
  missing,
  indent,
}: {
  label: string;
  /** Omitted by the "at the printings shown" row, which only qualifies the missing figure. */
  value?: string;
  missing?: string;
  indent?: boolean;
}) {
  const cellClass = cn("text-right font-medium tabular-nums", indent && "text-xs");
  return (
    <>
      <span className={cn("text-muted-foreground", indent && "pl-3 text-xs")}>{label}</span>
      <span className={cellClass}>{value}</span>
      {missing !== undefined && <span className={cellClass}>{missing}</span>}
    </>
  );
}
