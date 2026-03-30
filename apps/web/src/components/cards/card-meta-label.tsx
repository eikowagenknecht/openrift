import type { CardType, Rarity } from "@openrift/shared";
import { Sparkle } from "lucide-react";
import type { ReactNode } from "react";

import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardMetaLabelProps {
  shortCode: string;
  name: string;
  type: CardType;
  superTypes: string[];
  rarity: Rarity;
  isFoil?: boolean;
  className?: string;
  /** Optional price element rendered right-aligned on the name line. */
  price?: ReactNode;
}

/**
 * Card metadata label — shortcode, name, type + rarity icons.
 * Extracted from CardThumbnail so it can be reused in admin views.
 * @returns The label element.
 */
export function CardMetaLabel({
  shortCode,
  name,
  type,
  superTypes,
  rarity,
  isFoil,
  className,
  price,
}: CardMetaLabelProps) {
  const typeLabel = superTypes.length > 0 ? `${superTypes.join(" ")} ${type}` : type;

  return (
    // ⚠ space-y-0.5 and py-0.5 are mirrored as META_LINE_GAP / META_LABEL_PY in card-grid-constants.ts — update both together
    <div className={cn("bg-background space-y-0.5 rounded-md px-1.5 py-0.5", className)}>
      {/* ⚠ text-xs is mirrored as META_LINE_HEIGHT in card-grid-constants.ts — update both together */}
      {/* min-h-4: WebKit computes block height from font metrics instead of line-height */}
      {/* when overflow:hidden is set (via truncate), causing 1px shorter elements on iOS Safari. */}
      {/* See https://bugs.webkit.org/show_bug.cgi?id=225695 */}
      <div className="text-muted-foreground flex min-h-4 items-center justify-between gap-1 text-xs">
        <span className="truncate font-medium">{shortCode}</span>
        <span className="flex shrink-0 items-center gap-1">
          <img
            src={getTypeIconPath(type, superTypes)}
            alt={typeLabel}
            title={typeLabel}
            className="size-3.5 brightness-0 dark:invert"
          />
          <img
            src={`/images/rarities/${rarity.toLowerCase()}-28x28.webp`}
            alt={rarity}
            title={rarity}
            width={28}
            height={28}
            className="size-3.5"
          />
          {isFoil && (
            <span title="Foil">
              <Sparkle className="size-3.5 fill-amber-400 text-amber-400" />
            </span>
          )}
        </span>
      </div>
      {/* min-h-4: same WebKit workaround as above */}
      <div className="flex min-h-4 items-center gap-1 text-xs font-medium">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {price}
      </div>
    </div>
  );
}
