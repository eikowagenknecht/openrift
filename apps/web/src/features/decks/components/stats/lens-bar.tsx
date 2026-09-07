import { Pressable } from "@/components/ui/pressable";
import type { LensRow, LensSeries } from "@/features/decks/lib/deck-stat-lenses";
import { cn } from "@/lib/utils";

interface LensBarProps {
  title?: string;
  rows: readonly LensRow[];
  series: readonly LensSeries[];
  onSegmentClick?: (key: string) => void;
  footnote?: string;
  focusValue?: string | null;
  hitRows?: readonly LensRow[];
}

const MISS_OPACITY = 0.3;

export function LensBar({
  title,
  rows,
  series,
  onSegmentClick,
  footnote,
  focusValue,
  hitRows,
}: LensBarProps) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (rows.length === 0 || total === 0) {
    return null;
  }

  const colorFor = (key: string) =>
    series.find((entry) => entry.key === key)?.color ?? "var(--color-muted-foreground)";
  const hitByKey = new Map((hitRows ?? []).map((row) => [row.key, row]));
  const segmentOpacity = (key: string) =>
    focusValue === null || focusValue === undefined || key === focusValue ? 1 : MISS_OPACITY;
  const hitFraction = (row: LensRow) => {
    if (!hitRows) {
      return 1;
    }
    const hit = hitByKey.get(row.key)?.total ?? 0;
    return row.total > 0 ? Math.min(1, hit / row.total) : 0;
  };

  return (
    <div>
      {title !== undefined && (
        <div className="mb-1 flex items-center text-xs">
          <h4 className="font-medium">{title}</h4>
        </div>
      )}
      <div className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full">
        {rows
          .filter((row) => row.total > 0)
          .map((row) => {
            const fraction = hitFraction(row);
            const fill = (
              <span aria-hidden className="flex h-full w-full">
                {fraction > 0 && (
                  <span
                    style={{ backgroundColor: colorFor(row.key), flexGrow: fraction, flexBasis: 0 }}
                  />
                )}
                {fraction < 1 && (
                  <span
                    style={{
                      backgroundColor: colorFor(row.key),
                      opacity: MISS_OPACITY,
                      flexGrow: 1 - fraction,
                      flexBasis: 0,
                    }}
                  />
                )}
              </span>
            );
            if (!onSegmentClick) {
              return (
                <span
                  key={row.key}
                  title={row.label}
                  className="flex h-full"
                  style={{ flexGrow: row.total, flexBasis: 0, opacity: segmentOpacity(row.key) }}
                >
                  {fill}
                </span>
              );
            }
            return (
              <Pressable
                key={row.key}
                onClick={() => onSegmentClick(row.key)}
                aria-label={row.label}
                title={row.label}
                className="flex h-full cursor-pointer"
                style={{ flexGrow: row.total, flexBasis: 0, opacity: segmentOpacity(row.key) }}
              >
                {fill}
              </Pressable>
            );
          })}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {rows.map((row) => {
          const entry = (
            <>
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(row.key) }}
              />
              <span className={cn(row.total === 0 && "text-muted-foreground/60")}>{row.label}</span>
            </>
          );
          if (!onSegmentClick || row.total === 0) {
            return (
              <span
                key={row.key}
                className="text-muted-foreground flex items-center gap-1.5"
                style={{ opacity: segmentOpacity(row.key) }}
              >
                {entry}
              </span>
            );
          }
          return (
            <Pressable
              key={row.key}
              onClick={() => onSegmentClick(row.key)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              style={{ opacity: segmentOpacity(row.key) }}
            >
              {entry}
            </Pressable>
          );
        })}
      </div>
      {footnote && <p className="text-muted-foreground text-2xs mt-1">{footnote}</p>}
    </div>
  );
}
