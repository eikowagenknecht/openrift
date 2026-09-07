import type { Printing } from "@openrift/shared/types/catalog";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardDetailArt } from "@/components/cards/card-detail/card-detail-art";
import { CardPlateContent } from "@/components/cards/card-plate";
import { isChromaGround, useChromaPlate } from "@/components/present/stage-shell";
import type { PresentationItem } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentation-store";

/**
 * Fixed width: sizing to content would shift the artwork sideways between
 * cards. On a chroma ground it gets an opaque plate, or the text fringes.
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

export function CardStageMain({
  items,
  index,
  badge,
}: {
  items: PresentationItem[];
  index: number;
  /** A tier run puts its rank here; the only thing on stage saying where a card landed once the board is off. */
  badge?: ReactNode;
}) {
  const showText = usePresentationStore((state) => state.showText);
  const cardScale = usePresentationStore((state) => state.cardScale);
  const chroma = isChromaGround(usePresentationStore((state) => state.ground));

  // Adjusted during render (state derived from a changed prop), not in an
  // effect, so the direction class is right on the first paint.
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
        {/* The fade is dropped on a chroma ground: a part-opaque frame over
            the key gets eaten by the chroma filter instead of blending. */}
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
