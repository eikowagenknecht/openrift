import type { CollectionResponse, Marketplace } from "@openrift/shared";
import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatterForMarketplace } from "@/lib/format";

interface CollectionInfoStripProps {
  totalCopies: number;
  uniqueCount: number;
  selectedCount: number;
  isSelectMode: boolean;
  favoriteMarketplace: Marketplace;
  currentCollection?: CollectionResponse;
  collections: CollectionResponse[];
}

export function CollectionInfoStrip({
  totalCopies,
  uniqueCount,
  selectedCount,
  isSelectMode,
  favoriteMarketplace,
  currentCollection,
  collections,
}: CollectionInfoStripProps) {
  const formatValue = formatterForMarketplace(favoriteMarketplace);
  const valueCents = currentCollection
    ? currentCollection.totalValueCents
    : collections.reduce((sum, col) => sum + (col.totalValueCents ?? 0), 0);
  const unpricedCount = currentCollection
    ? currentCollection.unpricedCopyCount
    : collections.reduce((sum, col) => sum + (col.unpricedCopyCount ?? 0), 0);

  return (
    <div className="bg-muted/50 text-muted-foreground mt-3 mb-3 flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
      <span className="shrink-0">
        {totalCopies} card{totalCopies === 1 ? "" : "s"}
        {uniqueCount !== totalCopies && ` (${uniqueCount} unique)`}
      </span>
      {isSelectMode && selectedCount > 0 && (
        <Badge variant="secondary" className="gap-1">
          <CheckIcon className="size-3" />
          {selectedCount}
        </Badge>
      )}
      <div className="flex-1" />
      {valueCents !== null && valueCents !== undefined && (
        <span className="shrink-0">
          {formatValue(valueCents / 100)}
          {unpricedCount ? (
            <span className="text-muted-foreground/60 ml-1">({unpricedCount} unpriced)</span>
          ) : null}
        </span>
      )}
    </div>
  );
}
