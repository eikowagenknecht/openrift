interface CollectionValueSummaryProps {
  valueCents: number | null | undefined;
  unpricedCount: number | null | undefined;
  formatValue: (value: number) => string;
}

// A missing or zero value renders nothing, not "$0.00".
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
