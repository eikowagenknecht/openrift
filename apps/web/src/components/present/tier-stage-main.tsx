import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { PresentationTextPanel } from "@/components/present/card-stage-main";
import { StageRankBadge } from "@/components/present/stage-rank-badge";
import { isChromaGround, useChromaPlate } from "@/components/present/stage-shell";
import { TierBoard } from "@/components/tier-lists/tier-board";
import type { ResolvedTierRow, TierCardView, TierQueueStop } from "@/lib/tier-list-presentation";
import { revealedRows } from "@/lib/tier-list-presentation";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentation-store";

export function TierStageMain({
  rows,
  queue,
  index,
  onIndexChange,
}: {
  rows: readonly ResolvedTierRow[];
  queue: readonly TierQueueStop[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const reveal = usePresentationStore((state) => state.reveal);
  const showHero = usePresentationStore((state) => state.showHero);
  const showText = usePresentationStore((state) => state.showText);
  const showRank = usePresentationStore((state) => state.showRank);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const chroma = isChromaGround(usePresentationStore((state) => state.ground));
  const plate = useChromaPlate();

  const current = queue[index];
  if (!current) {
    return null;
  }

  const shown = reveal ? revealedRows(rows, queue, index) : rows;
  const focusCardId = reveal
    ? (queue[index - 1]?.printing.cardId ?? null)
    : current.printing.cardId;
  const rankVisible = showRank && !reveal;
  const heroVisible = reveal || showHero || showText || rankVisible;

  // Disabled during reveal: jumping to an already-ranked tile would un-place
  // every card after it in the run.
  const handleCardClick = reveal
    ? undefined
    : (view: TierCardView) => {
        const target = queue.findIndex((stop) => stop.printing.cardId === view.cardId);
        if (target !== -1) {
          onIndexChange(target);
        }
      };

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-[3vw] p-[3vh]">
      {heroVisible && (
        // Fixed width: sizing the column to the loaded art reflowed the board
        // on every step.
        <div className="flex min-h-0 w-[22rem] max-w-[30vw] shrink-0 flex-col items-center justify-center gap-4">
          {rankVisible && current.contextLabel && (
            <StageRankBadge
              label={current.contextLabel}
              rowIndex={current.rowIndex}
              unranked={rows[current.rowIndex]?.unranked}
            />
          )}
          {showHero || reveal ? (
            <div
              className="aspect-card relative min-h-0 shrink"
              style={{
                width: `${cardScale * 100}%`,
                maxHeight: `${showText ? 55 : 90}%`,
              }}
            >
              {/* On a chroma ground the fade is skipped: a part-opaque card
                  over the key comes out chewed rather than faded. */}
              <div
                key={current.id}
                className={cn("absolute inset-0", !chroma && "animate-in fade-in duration-300")}
              >
                <CardDetailArt printing={current.printing} showImages disableTilt />
              </div>
            </div>
          ) : null}
          {showText && <PresentationTextPanel printing={current.printing} className="w-full" />}
        </div>
      )}

      <div className="-mx-1 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-1 py-1">
        <TierBoard
          rows={shown}
          focusCardId={focusCardId}
          spotlight={!reveal}
          onCardClick={handleCardClick}
          emptyRowLabel={reveal ? "" : "Nothing here"}
          // Rows are drawn on a translucent card colour; on a chroma ground
          // they'd key out with the background without the plate.
          className={cn("w-full max-w-5xl", plate)}
        />
      </div>
    </div>
  );
}
