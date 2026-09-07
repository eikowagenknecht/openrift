import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared/tier-colors";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import {
  TierCardTile,
  tierRowMinHeight,
  useTierTileWidth,
} from "@/components/tier-lists/tier-card-tile";
import { Pressable } from "@/components/ui/pressable";
import type { ResolvedTierRow, TierCardView } from "@/lib/tier-list-presentation";
import { cn } from "@/lib/utils";

interface TierRowFrameProps {
  rowIndex: number;
  unranked?: boolean;
  label: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  tileWidth?: number;
  clip?: boolean;
  children: ReactNode;
}

/**
 * The strip's minimum height is derived from tile size, so an empty tier is
 * the same height as a full one and doesn't resize when the first card lands.
 */
export function TierRowFrame({
  rowIndex,
  unranked,
  label,
  leading,
  trailing,
  active,
  tileWidth,
  clip,
  children,
}: TierRowFrameProps) {
  // Called unconditionally, override or not — a hook behind a `??` would be a
  // conditional call, and the React Compiler needs the same hooks every render.
  const readerWidth = useTierTileWidth();
  const width = tileWidth ?? readerWidth;

  return (
    <div
      className={cn(
        "bg-card/40 flex items-stretch overflow-hidden rounded-md ring-1 transition-colors",
        active ? "ring-ring ring-2" : "ring-border",
      )}
    >
      {leading}
      <div
        // wrap-anywhere, not truncate: a long tier name must not lose its tail.
        className="flex w-12 shrink-0 items-center justify-center px-1 text-center font-bold wrap-anywhere sm:w-14"
        style={{ backgroundColor: tierRowColor(rowIndex, unranked), color: TIER_LABEL_INK }}
      >
        {label}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 content-center items-center gap-1 p-1",
          clip ? "flex-nowrap" : "flex-wrap",
        )}
        style={{ minHeight: tierRowMinHeight(width) }}
      >
        {children}
      </div>
      {trailing}
    </div>
  );
}

interface TierBoardProps {
  rows: readonly ResolvedTierRow[];
  onCardClick?: (view: TierCardView) => void;
  focusCardId?: string | null;
  spotlight?: boolean;
  emptyRowLabel?: string;
  tileWidth?: number;
  className?: string;
}

/** Empty rows are drawn: an empty tier is a deliberate ranking, not missing data. */
export function TierBoard({
  rows,
  onCardClick,
  focusCardId,
  spotlight,
  emptyRowLabel = "Nothing here",
  tileWidth,
  className,
}: TierBoardProps) {
  const readerWidth = useTierTileWidth();
  const width = tileWidth ?? readerWidth;
  const focusRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!focusCardId) {
      return;
    }
    focusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusCardId]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {rows.map((row, rowIndex) => (
        <TierRowFrame
          key={rowIndex}
          rowIndex={rowIndex}
          unranked={row.unranked}
          label={row.label}
          tileWidth={tileWidth}
        >
          {row.cards.length === 0 ? (
            <span className="text-muted-foreground px-1 text-sm italic">{emptyRowLabel}</span>
          ) : (
            row.cards.map((view) => {
              const focused = Boolean(focusCardId) && view.cardId === focusCardId;
              return (
                <span
                  key={view.cardId}
                  ref={focused ? focusRef : undefined}
                  // The ring stays inside the row's own `p-1`, so a spotlit tile
                  // at either end is not clipped by the row's overflow.
                  className={cn(
                    "inline-flex rounded-sm transition-opacity duration-300",
                    spotlight && (focused ? "ring-border-accent ring-2" : "opacity-30"),
                  )}
                >
                  {onCardClick ? (
                    <TierBoardCardButton view={view} width={width} onClick={onCardClick} />
                  ) : (
                    <TierCardTile view={view} width={width} />
                  )}
                </span>
              );
            })
          )}
        </TierRowFrame>
      ))}
    </div>
  );
}

function TierBoardCardButton({
  view,
  width,
  onClick,
}: {
  view: TierCardView;
  width: number;
  onClick: (view: TierCardView) => void;
}) {
  return (
    <Pressable aria-label={view.card.name} className="rounded-sm" onClick={() => onClick(view)}>
      <TierCardTile view={view} width={width} />
    </Pressable>
  );
}
