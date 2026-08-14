import type { Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { frontImageId } from "@/lib/card-meta";
import { formatCardId } from "@/lib/format";

/**
 * Small front-face thumbnail for a printing. Shared by the printing picker and
 * the import catalog search so the two stay visually consistent.
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
 * Thumbnail + two-line label (card ID above variant label) used inside a list
 * item — e.g. the deck builder's "Change printing" menu and the import
 * preview's printing picker. Landscape thumbnail for Battlefields.
 * @returns A flex row with the thumbnail and label column.
 */
export function PrintingOptionContent({
  printing,
  siblings,
}: {
  printing: Printing;
  siblings?: Printing[];
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <PrintingThumbnail printing={printing} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-muted-foreground font-mono text-xs">{formatCardId(printing)}</span>
        <span className="min-w-0 text-xs">
          <PrintingVariantLabel printing={printing} siblings={siblings} />
        </span>
      </span>
    </div>
  );
}
