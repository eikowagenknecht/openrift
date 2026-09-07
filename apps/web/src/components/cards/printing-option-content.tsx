import type { Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { frontImageId } from "@/lib/card-meta";

/** Fixed strip frame keeps row height stable when landscape and portrait cards mix in one list. */
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

export function CardThumbnail({ cardId, className }: { cardId: string; className?: string }) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const printing = getPreferredPrinting(cardId);
  if (!printing) {
    return <CardArtThumb shape="strip" className={className ?? "h-10"} />;
  }
  return <PrintingThumbnail printing={printing} className={className} />;
}

export function cardSearchLeading(cardId: string): ReactNode {
  return <CardThumbnail cardId={cardId} className="h-8" />;
}
