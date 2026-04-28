import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";

import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const { labels } = useEnumOrders();
  const frontImageId = printing.images.find((image) => image.face === "front")?.imageId ?? null;
  const thumbnail = frontImageId ? imageUrl(frontImageId, "120w") : null;
  const label = formatPrintingLabel(printing, siblings, labels);
  const landscape = printing.card.type === "Battlefield";
  const thumbnailSize = landscape ? "h-10 w-14" : "h-14 w-10";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className={cn(thumbnailSize, "shrink-0 rounded object-cover")}
          draggable={false}
        />
      ) : (
        <div className={cn(thumbnailSize, "bg-muted shrink-0 rounded")} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-muted-foreground font-mono text-xs">{formatCardId(printing)}</span>
        <span className="truncate text-xs">{label}</span>
      </span>
    </div>
  );
}
