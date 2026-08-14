import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useState } from "react";

import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { CardDetailStats } from "@/components/cards/card-detail/card-detail-stats";
import { CardDetailText } from "@/components/cards/card-detail/card-detail-text";
import { formatPublicCode } from "@/lib/format";
import type { PresentationItem } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentation-store";

/**
 * The rules-text side panel, toggled with `T`.
 *
 * A fixed width, and everything in it left-aligned. Both matter on a stage the
 * viewer is watching: a panel sized to its contents would resize between a wordy
 * card and a vanilla one, shifting the artwork sideways on every step. The
 * default is the width the card layout is framed around; the board layout stacks
 * this under a narrower hero and passes its own.
 *
 * @returns The name, code, stats and text beside the card.
 */
export function PresentationTextPanel({
  printing,
  className,
}: {
  printing: Printing;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-4 self-center",
        className ?? "w-[32rem] max-w-[40vw]",
      )}
    >
      <h1 className="text-3xl font-semibold text-balance">{legendDisplayName(printing.card)}</h1>
      <div className="font-mono text-sm tracking-wider text-white/50 uppercase">
        {formatPublicCode(printing)}
      </div>
      <CardDetailStats printing={printing} align="start" />
      <CardDetailText printing={printing} />
    </div>
  );
}

/**
 * The stage's card layout: one card filling the frame, with the rules panel
 * beside it when `T` is on. This is what a deck walk and an ad-hoc queue show,
 * and what a tier list falls back to when the board layout is turned off.
 *
 * @returns The card layout, or null when the queue has nothing at this index.
 */
export function CardStageMain({ items, index }: { items: PresentationItem[]; index: number }) {
  const showText = usePresentationStore((state) => state.showText);
  const cardScale = usePresentationStore((state) => state.cardScale);

  // Which way the queue last moved, so the incoming card flies in from the side
  // it came from. Adjusted during render (React's documented pattern for state
  // derived from a changed prop) rather than in an effect, so the animation
  // class is right on the first paint of the new card.
  const [seenIndex, setSeenIndex] = useState(index);
  const [forwards, setForwards] = useState(true);
  if (seenIndex !== index) {
    setForwards(index > seenIndex);
    setSeenIndex(index);
  }

  const current = items[index];
  if (!current) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-[4vw] p-[4vh]">
      <div
        className="aspect-card relative max-w-full shrink"
        style={{ height: `${cardScale * 100}%` }}
      >
        {/* Keyed on the queue position so every step remounts the layer and
            replays the entry animation, sliding in from the side the queue
            moved towards. */}
        <div
          key={current.id}
          className={cn(
            "animate-in fade-in absolute inset-0 duration-300 ease-out",
            forwards ? "slide-in-from-right-16" : "slide-in-from-left-16",
          )}
        >
          <CardDetailArt printing={current.printing} showImages disableTilt />
        </div>
      </div>

      {showText && <PresentationTextPanel printing={current.printing} />}
    </div>
  );
}
