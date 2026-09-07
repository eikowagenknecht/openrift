import type { Printing } from "@openrift/shared/types/catalog";
import type { ReactNode } from "react";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { PrintingThumbnail } from "@/components/cards/printing-option-content";
import { formatCardId } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";

export function PrintingVariantLine({
  printing,
  siblings,
  className,
}: {
  printing: Printing;
  siblings?: readonly Printing[];
  className?: string;
}) {
  const hasMixedRarities = siblings ? new Set(siblings.map((p) => p.rarity)).size > 1 : false;
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);
  const code = formatCardId(printing);

  return (
    <PrintingVariantLabel
      printing={printing}
      siblings={siblings}
      className={className}
      code={
        <>
          {hasMixedRarities && rarityIcon && (
            <img
              src={rarityIcon}
              alt={printing.rarity}
              title={printing.rarity}
              width={28}
              height={28}
              className="mr-1 inline size-3.5 align-text-bottom"
            />
          )}
          <span className="text-muted-foreground font-mono text-xs">{code}</span>
        </>
      }
    />
  );
}

export function PrintingRowContent({
  printing,
  siblings,
  name,
  right,
  thumbClassName,
}: {
  printing: Printing;
  siblings?: readonly Printing[];
  name?: string;
  right?: ReactNode;
  thumbClassName?: string;
}) {
  return (
    // A span, not a div: the scan sheets nest this inside a Pressable, and a
    // flow element inside a button is invalid markup.
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <PrintingThumbnail
        printing={printing}
        className={thumbClassName ?? (name ? "h-10" : "h-8")}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        {name ? <span className="truncate font-medium">{name}</span> : null}
        <span className="min-w-0 truncate text-xs">
          <PrintingVariantLine printing={printing} siblings={siblings} />
        </span>
      </span>
      {right}
    </span>
  );
}
