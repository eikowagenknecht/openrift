import type { Marketplace } from "@openrift/shared";
import { ChevronDownIcon, ChevronRightIcon, PackageSearchIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { formatterForMarketplace } from "@/lib/format";

interface DeckOwnershipPanelProps {
  data: DeckOwnershipData;
  marketplace: Marketplace;
  onViewMissing: () => void;
}

export function DeckOwnershipPanel({ data, marketplace, onViewMissing }: DeckOwnershipPanelProps) {
  const [open, setOpen] = useState(false);
  const pct = data.totalNeeded > 0 ? Math.round((data.totalOwned / data.totalNeeded) * 100) : 0;
  const fmt = formatterForMarketplace(marketplace);

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
        <div className="space-y-3 border-t px-3 py-3">
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

function OwnershipBar({ pct }: { pct: number }) {
  return (
    <div className="bg-muted flex h-2 flex-1 overflow-hidden rounded-full">
      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
