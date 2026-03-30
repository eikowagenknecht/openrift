import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";

interface OwnedCountStripProps {
  count: number;
  printingId?: string;
}

/**
 * Compact owned-count label rendered above the card image in browse/select modes.
 * Matches the dimensions of AddStrip (h-5 + mb-1 = 24px) so the virtualizer row
 * height estimate stays consistent across all collection view modes.
 * When a `printingId` is provided, clicking the count opens a collection breakdown popover.
 * @returns The owned-count strip.
 */
export function OwnedCountStrip({ count, printingId }: OwnedCountStripProps) {
  return (
    // ⚠ h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants — update both together
    <div className="relative z-10 mb-1 flex h-5 items-center justify-center">
      {printingId ? (
        <OwnedCollectionsPopover printingId={printingId} count={count} align="center" />
      ) : (
        <span className="text-muted-foreground text-xs font-medium">&times;{count}</span>
      )}
    </div>
  );
}
