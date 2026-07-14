import type { Printing } from "@openrift/shared";
import { getOrientation, imageUrl } from "@openrift/shared";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { formatCardId } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Small front-face thumbnail for a printing, sized portrait or landscape from
 * the card type (Battlefields are landscape). Falls back to a muted box when no
 * image exists. Shared by the printing picker and the import catalog search so
 * the two stay visually consistent.
 * @returns The thumbnail image, or a placeholder box.
 */
export function PrintingThumbnail({
  printing,
  className,
}: {
  printing: Printing;
  className?: string;
}) {
  const frontImageId = printing.images.find((image) => image.face === "front")?.imageId ?? null;
  const thumbnail = frontImageId ? imageUrl(frontImageId, "120w") : null;
  const landscape = getOrientation(printing.card.types) === "landscape";
  const thumbnailSize = landscape ? "h-10 w-14" : "h-14 w-10";

  const placeholderBox = (
    <div className={cn(thumbnailSize, "bg-muted shrink-0 rounded", className)} />
  );
  return thumbnail ? (
    <ImgWithFallback
      src={thumbnail}
      alt=""
      className={cn(thumbnailSize, "shrink-0 rounded object-cover", className)}
      draggable={false}
      fallback={placeholderBox}
    />
  ) : (
    placeholderBox
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
