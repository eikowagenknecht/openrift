import type { Printing } from "@openrift/shared/types/catalog";
import { getOrientation } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

import { useCardTilt } from "@/features/cards/hooks/use-card-tilt";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useDisplayStore } from "@/stores/display-store";

import { CardImage } from "./card-image";

/**
 * The card artwork with its tilt container and foil treatment. Owns the tilt
 * and foil preferences so both detail layouts render the art identically.
 */
export function CardDetailArt({
  printing,
  showImages,
  disableTilt,
}: {
  printing: Printing;
  showImages?: boolean;
  disableTilt?: boolean;
}) {
  const { card } = printing;
  const orientation = getOrientation(card.types);
  const isFoil = printing.finish === WellKnown.finish.FOIL;

  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);

  // Must agree with SSR: showShimmer flips a class on coarse-pointer devices
  // and a mismatch would abort hydration.
  const coarsePointer = useCoarsePointer();
  const tiltMode = coarsePointer ? ("none" as const) : ("pointer" as const);

  // Destructure into locals so React Compiler's ref heuristic doesn't flag
  // property access on the hook result — see the note in card-thumbnail.tsx.
  const { containerRef: tiltContainerRef, innerRef: tiltInnerRef } = useCardTilt({
    mode: tiltMode,
    enabled: !disableTilt && cardTilt && (!coarsePointer || isFoil),
  });

  const showFoil = isFoil && foilEffect;
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
