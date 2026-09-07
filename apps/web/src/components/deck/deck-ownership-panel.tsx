import type { Marketplace } from "@openrift/shared/types/pricing";
import { PackageSearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";
import { formatterForMarketplace } from "@/lib/format";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import { cn } from "@/lib/utils";

interface DeckOwnershipPanelProps {
  data: DeckOwnershipData;
  marketplace: Marketplace;
  onViewMissing: () => void;
}

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

function PriceBlock({ data, marketplace }: { data: DeckOwnershipData; marketplace: Marketplace }) {
  const fmt = formatterForMarketplace(marketplace);
  const showMissing = data.missingValueCents !== undefined && data.missingValueCents > 0;
  const showSplit = data.sideboardValueCents !== undefined && data.sideboardValueCents > 0;
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

// Cells are direct grid children so every row's figures line up in the same columns.
function PriceRow({
  label,
  value,
  missing,
  indent,
}: {
  label: string;
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
