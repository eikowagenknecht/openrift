import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { PresentationTextPanel } from "@/components/present/card-stage-main";
import { isChromaGround, useChromaPlate } from "@/components/present/stage-shell";
import { TierBoard } from "@/components/tier-lists/tier-board";
import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import type { ResolvedTierRow, TierQueueStop } from "@/lib/tier-list-presentation";
import { revealedRows } from "@/lib/tier-list-presentation";
import { cn } from "@/lib/utils";
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
 *   wants. Clicking any tile jumps the run to that card.
 * - **Reveal** (reveal on). The board holds only what the run has already
 *   placed, and the current card waits beside it. Stepping forward is what drops
 *   it into its tier, so the ladder fills as the segment goes — the beat a
 *   ranking video is built on.
 *
 * The card beside the board (`C`) and its rules text (`T`) are independent: a
 * creator frames the artwork and the wall of text separately, so turning the
 * text off must not take the card with it.
 *
 * @returns The board layout, or null when the queue has nothing at this index.
 */
export function TierStageMain({
  rows,
  queue,
  index,
  onIndexChange,
}: {
  /** The full board, in board order regardless of which way the run walks it. */
  rows: readonly ResolvedTierRow[];
  queue: readonly TierQueueStop[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const reveal = usePresentationStore((state) => state.reveal);
  const showHero = usePresentationStore((state) => state.showHero);
  const showText = usePresentationStore((state) => state.showText);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const chroma = isChromaGround(usePresentationStore((state) => state.ground));
  const plate = useChromaPlate();

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
  // A reveal is the card waiting to be placed, so it always holds one up.
  const heroVisible = reveal || showHero || showText;

  // Only outside a reveal: with the board complete, a tile is a place to jump
  // to. Mid-reveal it would un-place everything after it, which is not what
  // clicking a card you already ranked looks like it should do.
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
        // A fixed width, not one derived from the card box: a column that sized
        // itself to whatever art had loaded reflowed the board on every step,
        // which read as the ladder shaking.
        <div className="flex min-h-0 w-[22rem] max-w-[30vw] shrink-0 flex-col items-center justify-center gap-4">
          {showHero || reveal ? (
            <div
              className="aspect-card relative min-h-0 w-full shrink"
              // A shorter card when the text panel is under it, so the pair
              // still fits the stage rather than pushing the text off the bottom.
              style={{ maxHeight: `${cardScale * (showText ? 55 : 90)}%` }}
            >
              {/* Keyed on the stop so each step replays the fade, which is what
                  reads as the card being *taken up* before it is placed. On a
                  chroma ground there is no fade to replay: a part-opaque card
                  over the key comes out chewed rather than faded, so the card
                  simply appears. */}
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

      {/* `items-center` centres a short ladder; once it outgrows the stage the
          container scrolls and the board's own focus scroll keeps up. The inner
          padding (pulled back by the negative margin so nothing shifts) gives
          the rows' outset ring somewhere to live: an overflow container clips
          it flush against both edges otherwise. */}
      <div className="-mx-1 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-1 py-1">
        <TierBoard
          rows={shown}
          focusCardId={focusCardId}
          spotlight={!reveal}
          onCardClick={handleCardClick}
          emptyRowLabel={reveal ? "" : "Nothing here"}
          // Capped so a wide screen doesn't stretch each tier into a single
          // endless line — a ladder reads as a ladder only while the rows wrap.
          // The plate matters more here than anywhere: the rows are drawn on a
          // translucent card colour and the spotlight dims the rest to 30%, so
          // on a chroma ground most of the board would key out with the ground.
          className={cn("w-full max-w-5xl", plate)}
        />
      </div>
    </div>
  );
}
