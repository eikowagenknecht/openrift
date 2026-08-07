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
 * cards button. Rendered inside the sidebar's merged Stats panel (below the
 * charts) rather than as its own collapsible.
 * @returns The ownership breakdown.
 */
export function DeckOwnershipBody({ data, marketplace, onViewMissing }: DeckOwnershipPanelProps) {
  const fmt = formatterForMarketplace(marketplace);

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
              Copies sitting in collections excluded from deck building. They don&apos;t count
              toward missing. Move them or turn the collection back on to use them.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {data.deckValueCents !== undefined && (
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground flex items-center gap-1.5 pb-0.5 text-xs">
            <img
              src={MARKETPLACE_META[marketplace].icon}
              alt=""
              className="h-3 invert dark:invert-0"
            />
            {MARKETPLACE_META[marketplace].label} prices
          </div>
          <Row label="Deck value" value={fmt(data.deckValueCents)} />
          {/* Only worth splitting out once the sideboard actually costs
              something — otherwise "Main deck" just repeats "Deck value". */}
          {data.sideboardValueCents !== undefined && data.sideboardValueCents > 0 && (
            <>
              <Row label="Main deck" value={fmt(data.mainValueCents)} indent />
              <Row label="Sideboard" value={fmt(data.sideboardValueCents)} indent />
            </>
          )}
          <Row label="Owned value" value={fmt(data.ownedValueCents)} />
          {data.missingValueCents !== undefined && data.missingValueCents > 0 && (
            <Row label="Missing value" value={fmt(data.missingValueCents)} />
          )}
          {/* The cheapest-completion figure above can undercut the creator's
              pinned printings — show what the pins would cost when it does. */}
          {data.missingAsDisplayedValueCents !== undefined &&
            data.missingValueCents !== undefined &&
            data.missingAsDisplayedValueCents > data.missingValueCents && (
              <Row label="As shown" value={fmt(data.missingAsDisplayedValueCents)} indent />
            )}
        </div>
      )}

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
