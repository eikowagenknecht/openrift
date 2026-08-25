import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { PrintingThumbnail } from "@/components/cards/printing-option-content";
import { formatCardId } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";

/**
 * The canonical one-line description of a printing among its siblings:
 * language chip · rarity icon + short code · variant labels.
 *
 * The rarity icon only appears when the sibling set actually mixes rarities —
 * a single-rarity list would otherwise repeat the same icon on every row,
 * which distinguishes nothing and just adds noise.
 *
 * @returns The inline variant label with the code slot filled in.
 */
export function PrintingVariantLine({
  printing,
  siblings,
  className,
}: {
  printing: Printing;
  /** The rows the label disambiguates against; also decides the rarity icon. */
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

/**
 * The body of a printing row: its own art, an optional card-name line, and the
 * variant line. Content only — the parent owns interactivity (a Pressable, a
 * SelectItem, a role=button row), so one grammar serves every list that has to
 * tell near-identical printings apart.
 *
 * Each row shows *its own* printing's art rather than a representative one:
 * that is the whole point of a printing list. The thumb is `h-8` on a one-line
 * row, so adding it doesn't lengthen a list that can run to many rows, and
 * `h-10` once a name line makes the row two lines tall anyway.
 *
 * @returns The row's content flex box.
 */
export function PrintingRowContent({
  printing,
  siblings,
  name,
  right,
  thumbClassName,
}: {
  printing: Printing;
  /** The rows the label disambiguates against; also decides the rarity icon. */
  siblings?: readonly Printing[];
  /** Card name line above the variant line (callers pass `legendDisplayName(...)`). */
  name?: string;
  /** Trailing content — prices, steppers, popovers. The caller styles it. */
  right?: ReactNode;
  thumbClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
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
    </div>
  );
}
