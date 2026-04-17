import type { Marketplace } from "@openrift/shared";
import { ChevronDownIcon, ChevronRightIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { formatterForMarketplace } from "@/lib/format";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import { cn } from "@/lib/utils";

interface DeckOwnershipPanelProps {
  data: DeckOwnershipData;
  marketplace: Marketplace;
  onViewMissing: () => void;
}

export function ownershipPercent(data: DeckOwnershipData): number {
  return data.totalNeeded > 0 ? Math.round((data.totalOwned / data.totalNeeded) * 100) : 0;
}

export function DeckOwnershipPanel({ data, marketplace, onViewMissing }: DeckOwnershipPanelProps) {
  const [open, setOpen] = useState(false);
  const pct = ownershipPercent(data);

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
        <span>Ownership</span>
        <OwnershipBar pct={pct} />
        <span className="text-muted-foreground text-xs">{pct}%</span>
      </button>

      {open && (
        <div className="border-t px-3 py-3">
          <DeckOwnershipBody data={data} marketplace={marketplace} onViewMissing={onViewMissing} />
        </div>
      )}
    </div>
  );
}

export function DeckOwnershipBody({ data, marketplace, onViewMissing }: DeckOwnershipPanelProps) {
  const fmt = formatterForMarketplace(marketplace);

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm">
        <Row label="Owned" value={`${data.totalOwned} / ${data.totalNeeded}`} />
        {data.missingCount > 0 && (
          <Row
            label="Missing"
            value={`${data.missingCount} ${data.missingCount === 1 ? "card" : "cards"}`}
          />
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
          <Row label="Owned value" value={fmt(data.ownedValueCents)} />
          {data.missingValueCents !== undefined && data.missingValueCents > 0 && (
            <Row label="Missing value" value={fmt(data.missingValueCents)} />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function OwnershipBar({
  pct,
  owned,
  total,
  className,
}: {
  pct: number;
  owned?: number;
  total?: number;
  className?: string;
}) {
  const bar = (
    <div className={cn("bg-muted flex h-2 flex-1 overflow-hidden rounded-full", className)}>
      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
  if (owned === undefined || total === undefined) {
    return bar;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div className="flex flex-1" />}>{bar}</TooltipTrigger>
        <TooltipContent side="bottom">
          {owned} / {total} owned
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
