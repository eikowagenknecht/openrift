import type { CatalogPrintingResponse, PackResult } from "@openrift/shared";

import { PullCard } from "@/components/pack-opener/pull-card";

interface PackBulkGridProps {
  packs: PackResult[];
  imagesByPrintingId: Map<string, CatalogPrintingResponse["images"]>;
  /** When true, foil pulls animate their rainbow overlay. */
  shimmer?: boolean;
}

const RARITY_RANK: Record<string, number> = {
  Ultimate: 0,
  Showcase: 1,
  Epic: 2,
  Rare: 3,
  Uncommon: 4,
  Common: 5,
};

// Multi-pack grid: face-up pulls sorted by rarity desc, with per-pack dividers.
export function PackBulkGrid({ packs, imagesByPrintingId, shimmer }: PackBulkGridProps) {
  return (
    <div className="space-y-6">
      {packs.map((pack, packIndex) => {
        const sorted = pack.pulls.toSorted((a, b) => {
          const keyA = a.slot === "ultimate" ? "Ultimate" : a.printing.rarity;
          const keyB = b.slot === "ultimate" ? "Ultimate" : b.printing.rarity;
          return (RARITY_RANK[keyA] ?? 99) - (RARITY_RANK[keyB] ?? 99);
        });
        return (
          <div key={packIndex}>
            <div className="mb-2 flex items-baseline justify-between border-b pb-1">
              <h3 className="font-semibold">Pack {packIndex + 1}</h3>
              <span className="text-muted-foreground text-xs">
                {pack.pulls.length} {pack.pulls.length === 1 ? "card" : "cards"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7">
              {sorted.map((pull, i) => (
                <PullCard
                  key={`${pull.printing.id}-${i}`}
                  pull={pull}
                  image={imagesByPrintingId.get(pull.printing.id)?.[0]}
                  shimmer={shimmer}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
