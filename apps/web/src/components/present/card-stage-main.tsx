import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { CardPlateContent } from "@/components/cards/card-plate";
import { isChromaGround, useChromaPlate } from "@/components/present/stage-shell";
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
 * The lines inside are the same {@link CardPlateContent} the stream overlay
 * paints, on the same per-field switches — set here from the stage's settings
 * popover rather than a pushed payload.
 *
 * On a chroma ground it gets an opaque plate under it, because text sitting
 * straight on the key is antialiased against it and comes out fringed.
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
  const plateFields = usePresentationStore((state) => state.plateFields);
  const plate = useChromaPlate();

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col self-center",
        className ?? "w-[32rem] max-w-[40vw]",
        plate,
      )}
    >
      <CardPlateContent printing={printing} fields={plateFields} size="stage" />
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
export function CardStageMain({
  items,
  index,
  badge,
}: {
  items: PresentationItem[];
  index: number;
  /**
   * Something to call the card out with, shown beside it. A tier run puts its
   * rank here, which is the only thing on stage that says where the card landed
   * once the board itself is switched off.
   */
  badge?: ReactNode;
}) {
  const showText = usePresentationStore((state) => state.showText);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const chroma = isChromaGround(usePresentationStore((state) => state.ground));

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
      {badge}
      <div
        className="aspect-card relative max-w-full shrink"
        style={{ height: `${cardScale * 100}%` }}
      >
        {/* Keyed on the queue position so every step remounts the layer and
            replays the entry animation, sliding in from the side the queue
            moved towards. The fade is dropped on a chroma ground: every frame
            of it is a part-opaque card over the key, which the chroma filter
            eats into rather than blends. The slide survives, being opaque
            throughout. */}
        <div
          key={current.id}
          className={cn(
            "animate-in absolute inset-0 duration-300 ease-out",
            !chroma && "fade-in",
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
