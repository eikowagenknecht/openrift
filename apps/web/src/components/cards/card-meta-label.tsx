import type { CardType, Rarity } from "@openrift/shared";

import type { VisibleFields } from "@/lib/card-fields";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardMetaLabelProps {
  shortCode: string;
  name: string;
  type: CardType;
  superTypes: string[];
  rarity: Rarity;
  /** Which fields to render. Defaults to all visible. */
  visibleFields?: VisibleFields;
  className?: string;
}

const ALL_FIELDS: VisibleFields = {
  number: true,
  title: true,
  type: true,
  rarity: true,
  price: true,
};

/**
 * Card metadata label — shortcode, name, type + rarity icons.
 * Extracted from CardThumbnail so it can be reused in admin views.
 * @returns The label element, or null if all fields are hidden.
 */
export function CardMetaLabel({
  shortCode,
  name,
  type,
  superTypes,
  rarity,
  visibleFields = ALL_FIELDS,
  className,
}: CardMetaLabelProps) {
  const showNumber = visibleFields.number;
  const showTitle = visibleFields.title;
  const showType = visibleFields.type;
  const showRarity = visibleFields.rarity;

  if (!showNumber && !showTitle && !showType && !showRarity) {
    return null;
  }

  const typeLabel = superTypes.length > 0 ? `${superTypes.join(" ")} ${type}` : type;

  return (
    // ⚠ space-y-0.5 and py-0.5 are mirrored as META_LINE_GAP / META_LABEL_PY in card-grid-constants.ts — update both together
    <div className={cn("bg-background space-y-0.5 rounded-md px-1.5 py-0.5", className)}>
      {(showNumber || showType || showRarity) && (
        // ⚠ text-xs is mirrored as META_LINE_HEIGHT in card-grid-constants.ts — update both together
        // min-h-4: WebKit computes block height from font metrics instead of line-height
        // when overflow:hidden is set (via truncate), causing 1px shorter elements on iOS Safari.
        // See https://bugs.webkit.org/show_bug.cgi?id=225695
        <div className="text-muted-foreground flex min-h-4 items-center justify-between gap-1 text-xs">
          {showNumber && <span className="truncate font-medium">{shortCode}</span>}
          {(showType || showRarity) && (
            <span className="flex shrink-0 items-center gap-1">
              {showType && (
                <img
                  src={getTypeIconPath(type, superTypes)}
                  alt={typeLabel}
                  title={typeLabel}
                  className="size-3.5 brightness-0 dark:invert"
                />
              )}
              {showRarity && (
                <img
                  src={`/images/rarities/${rarity.toLowerCase()}-28x28.webp`}
                  alt={rarity}
                  title={rarity}
                  width={28}
                  height={28}
                  className="size-3.5"
                />
              )}
            </span>
          )}
        </div>
      )}
      {showTitle && (
        // min-h-4: same WebKit workaround as above
        <p className="min-h-4 truncate text-xs font-medium">{name}</p>
      )}
    </div>
  );
}
