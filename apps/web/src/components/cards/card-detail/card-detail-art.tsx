import type { Printing } from "@openrift/shared";
import { WellKnown, getOrientation } from "@openrift/shared";

import { useCardTilt } from "@/hooks/use-card-tilt";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useDisplayStore } from "@/stores/display-store";

import { CardImage } from "./card-image";

/**
 * The card artwork with its tilt container and foil treatment. Owns the tilt
 * and foil preferences so both detail layouts render the art identically.
 * @returns The tilt-wrapped card image.
 */
export function CardDetailArt({
  printing,
  showImages,
}: {
  printing: Printing;
  showImages?: boolean;
}) {
  const { card } = printing;
  const orientation = getOrientation(card.types);
  const isFoil = printing.finish === WellKnown.finish.FOIL;

  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);

  // Hook over the IS_COARSE_POINTER module constant so SSR and the first
  // client render agree — `showShimmer` flips the foil overlay's animation
  // class on coarse-pointer devices and would otherwise abort hydration.
  const coarsePointer = useCoarsePointer();
  const tiltMode = coarsePointer ? ("none" as const) : ("pointer" as const);

  // Destructure into locals so React Compiler's ref heuristic doesn't flag
  // property access on the hook result — see the note in card-thumbnail.tsx.
  const { containerRef: tiltContainerRef, innerRef: tiltInnerRef } = useCardTilt({
    mode: tiltMode,
    enabled: cardTilt && (!coarsePointer || isFoil),
  });

  const showFoil = isFoil && foilEffect;
  // The detail view always uses animated foil — shimmers when tilt unavailable.
  const showShimmer = showFoil && (!cardTilt || coarsePointer);

  return (
    <div ref={tiltContainerRef}>
      <CardImage
        innerRef={tiltInnerRef}
        printing={printing}
        orientation={orientation}
        showImages={showImages}
        showFoil={showFoil}
        showShimmer={showShimmer}
      />
    </div>
  );
}
