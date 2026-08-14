import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { PresentationTextPanel } from "@/components/present/card-stage-main";
import { TierBoard } from "@/components/tier-lists/tier-board";
import type { ResolvedTierRow, TierQueueStop } from "@/lib/tier-list-presentation";
import { revealedRows } from "@/lib/tier-list-presentation";
import { usePresentationStore } from "@/stores/presentation-store";

/**
 * The stage's board layout: the whole ranking on screen, with the run's current
 * card called out.
 *
 * Two shapes, chosen with `R`:
 *
 * - **Spotlight** (reveal off). The finished board is up and the current card is
 *   ringed while the rest dim. The audience keeps the whole ranking in view
 *   while the talk moves card to card, which is what a "here is my list" segment
 *   wants.
 * - **Reveal** (reveal on). The board holds only what the run has already
 *   placed, and the current card waits beside it. Stepping forward is what drops
 *   it into its tier, so the ladder fills as the segment goes — the beat a
 *   ranking video is built on.
 *
 * @returns The board layout, or null when the queue has nothing at this index.
 */
export function TierStageMain({
  rows,
  queue,
  index,
}: {
  /** The full board, in board order regardless of which way the run walks it. */
  rows: readonly ResolvedTierRow[];
  queue: readonly TierQueueStop[];
  index: number;
}) {
  const reveal = usePresentationStore((state) => state.reveal);
  const showText = usePresentationStore((state) => state.showText);
  const cardScale = usePresentationStore((state) => state.cardScale);

  const current = queue[index];
  if (!current) {
    return null;
  }

  const shown = reveal ? revealedRows(rows, queue, index) : rows;
  // During a reveal the current card is not on the board yet, so the board
  // follows the one just placed; otherwise it follows the card being discussed.
  const focusCardId = reveal
    ? (queue[index - 1]?.printing.cardId ?? null)
    : current.printing.cardId;
  // The hero is the reveal's whole point. Outside a reveal it stands in for the
  // text panel's card, so `T` still has something to be a caption for.
  const heroVisible = reveal || showText;

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-[3vw] p-[3vh]">
      {heroVisible && (
        <div className="flex min-h-0 max-w-[32vw] shrink-0 flex-col items-center justify-center gap-4">
          <div
            className="aspect-card relative min-h-0 shrink"
            // A shorter card when the text panel is under it, so the pair still
            // fits the stage rather than pushing the text off the bottom.
            style={{ height: `${cardScale * (showText ? 55 : 85)}%` }}
          >
            {/* Keyed on the stop so each step replays the fade, which is what
                reads as the card being *taken up* before it is placed. */}
            <div key={current.id} className="animate-in fade-in absolute inset-0 duration-300">
              <CardDetailArt printing={current.printing} showImages disableTilt />
            </div>
          </div>
          {showText && (
            <PresentationTextPanel printing={current.printing} className="w-[22rem] max-w-[32vw]" />
          )}
        </div>
      )}

      {/* `items-center` centres a short ladder; once it outgrows the stage the
          container scrolls and the board's own focus scroll keeps up. */}
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto">
        <TierBoard
          rows={shown}
          focusCardId={focusCardId}
          spotlight={!reveal}
          emptyRowLabel={reveal ? "" : "Nothing here"}
          className="w-full"
        />
      </div>
    </div>
  );
}
