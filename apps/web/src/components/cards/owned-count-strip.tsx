interface OwnedCountStripProps {
  count: number;
}

/**
 * Compact owned-count label rendered above the card image in browse/select modes.
 * Matches the dimensions of AddStrip (h-5 + mb-1 = 24px) so the virtualizer row
 * height estimate stays consistent across all collection view modes.
 * @returns The owned-count strip.
 */
export function OwnedCountStrip({ count }: OwnedCountStripProps) {
  return (
    // ⚠ h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants — update both together
    <div className="relative z-10 mb-1 flex h-5 items-center justify-center">
      <span className="text-muted-foreground text-xs font-medium">×{count}</span>
    </div>
  );
}
