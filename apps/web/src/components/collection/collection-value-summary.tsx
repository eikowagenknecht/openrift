interface CollectionValueSummaryProps {
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
}

/**
 * The marketplace value shown next to the collection title in the top bar.
 *
 * @returns The formatted value with an optional unpriced-copy note, or null
 * when the value is missing or zero (a worthless collection shows nothing).
 */
export function CollectionValueSummary({
  valueCents,
  unpricedCount,
  formatValue,
}: CollectionValueSummaryProps) {
  if (!valueCents) {
    return null;
  }
  return (
    <span className="text-muted-foreground min-w-0 truncate text-xs">
      {formatValue(valueCents / 100)}
      {unpricedCount ? (
        <span className="text-muted-foreground/60 ml-1">({unpricedCount} unpriced)</span>
      ) : null}
    </span>
  );
}
