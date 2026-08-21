import type { Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { frontImageId } from "@/lib/card-meta";

/**
 * Small front-face thumbnail for a printing. The lead of every printing row
 * (see `PrintingRowContent`) plus the import catalog search, so the two stay
 * visually consistent.
 *
 * One strip frame serves both orientations: a Battlefield's landscape art fills
 * it exactly, and a portrait card crops to its illustration. The box used to
 * flip between `h-10 w-14` and `h-14 w-10`, which made the option rows jump
 * height as the list mixed the two.
 *
 * @returns The thumbnail.
 */
export function PrintingThumbnail({
  printing,
  className,
}: {
  printing: Printing;
  className?: string;
}) {
  return (
    <CardArtThumb
      shape="strip"
      imageId={frontImageId(printing)}
      landscape={getOrientation(printing.card.types) === "landscape"}
      rarity={printing.rarity}
      domains={printing.card.domains}
      className={className ?? "h-10"}
      loading="lazy"
    />
  );
}

/**
 * Thumbnail for a card rather than a specific printing: resolves the viewer's
 * representative printing (their language preference decides) and shows its
 * front art. This is what a *card*-scoped picker wants, since the row only has
 * to be recognizable and which variant supplies the pixels is not the user's
 * choice there. A printing-scoped picker uses {@link PrintingThumbnail}
 * directly instead, so every row shows its own art.
 *
 * @returns The thumbnail, or an empty frame while the catalog is still loading.
 */
export function CardThumbnail({ cardId, className }: { cardId: string; className?: string }) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const printing = getPreferredPrinting(cardId);
  if (!printing) {
    return <CardArtThumb shape="strip" className={className ?? "h-10"} />;
  }
  return <PrintingThumbnail printing={printing} className={className} />;
}
