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
  disableTilt,
}: {
  printing: Printing;
  showImages?: boolean;
  /**
   * Ignores the viewer's tilt preference and holds the card flat. Presentation
   * mode sets this: a card that leans away whenever the creator's pointer
   * crosses the stage is a wobble in the recording, not an effect.
   */
  disableTilt?: boolean;
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
    enabled: !disableTilt && cardTilt && (!coarsePointer || isFoil),
  });

  const showFoil = isFoil && foilEffect;
  // The detail view always uses animated foil — shimmers when tilt unavailable,
  // which now includes a caller that has switched tilt off outright.
  const showShimmer = showFoil && (disableTilt === true || !cardTilt || coarsePointer);

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
