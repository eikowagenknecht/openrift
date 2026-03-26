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
  compact?: boolean;
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
 * Card metadata label — number, name, type icon + text, rarity icon + text.
 * Extracted from CardThumbnail so it can be reused in admin views.
 * @returns The label element, or null if all fields are hidden.
 */
export function CardMetaLabel({
  shortCode,
  name,
  type,
  superTypes,
  rarity,
  compact,
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
    <div className={cn("space-y-0.5 rounded-md bg-background px-1.5 py-0.5", className)}>
      {compact ? (
        <>
          {(showNumber || showType || showRarity) && (
            <div className="flex min-h-4 items-center justify-between gap-1 text-xs text-muted-foreground">
              {showNumber && (
                <span className="truncate font-medium">
                  #{shortCode.slice(shortCode.lastIndexOf("-") + 1)}
                </span>
              )}
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
          {showTitle && <p className="min-h-4 truncate text-xs font-medium">{name}</p>}
        </>
      ) : (
        <>
          {(showNumber || showTitle) && (
            // ⚠ text-xs / sm:text-sm are mirrored as META_LINE_HEIGHT / META_LINE_HEIGHT_SM in card-grid.tsx — update both together
            // min-h-4 / sm:min-h-5: WebKit computes block height from font metrics instead of line-height
            // when overflow:hidden is set (via truncate), causing 1px shorter elements on iOS Safari.
            // See https://bugs.webkit.org/show_bug.cgi?id=225695, https://iamvdo.me/en/blog/css-font-metrics-line-height-and-vertical-align
            <p className="min-h-4 truncate text-xs font-medium sm:min-h-5 sm:text-sm">
              {showNumber && <span className="text-muted-foreground">{shortCode}</span>}
              {showNumber && showTitle && " "}
              {showTitle && name}
            </p>
          )}
          {(showType || showRarity) && (
            // ⚠ text-xs is mirrored as META_LINE_HEIGHT in card-grid.tsx — update both together
            // min-h-4: same WebKit workaround as above
            <p className="flex min-h-4 items-center gap-1 truncate text-xs text-muted-foreground">
              {showType && (
                <>
                  <img
                    src={getTypeIconPath(type, superTypes)}
                    alt=""
                    className="size-3.5 brightness-0 dark:invert"
                  />
                  {typeLabel}
                </>
              )}
              {showType && showRarity && <span>&middot;</span>}
              {showRarity && (
                <>
                  <img
                    src={`/images/rarities/${rarity.toLowerCase()}-28x28.webp`}
                    alt=""
                    width={28}
                    height={28}
                    className="size-3.5"
                  />
                  {rarity}
                </>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
