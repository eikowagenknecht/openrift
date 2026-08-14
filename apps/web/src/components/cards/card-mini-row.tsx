import type { ImageVariant } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { getPipBackgroundStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardMiniRowProps {
  /**
   * Pre-built image URL. Use when you only have a denormalized URL (e.g. price
   * data from the API), not an image id. Takes precedence over `imageId`.
   */
  src?: string | null;
  /** Image id resolved at `variant`. Ignored when `src` is set. */
  imageId?: string | null;
  /** Variant requested when resolving `imageId`. A strip is ~34px wide, so `120w` fits. */
  variant?: ImageVariant;
  /** Alt text for the art. Leave empty when the row already names the card. */
  alt?: string;
  /** Battlefield art. Derive from `getOrientation(card.types) === "landscape"`. */
  landscape?: boolean;
  /**
   * The card's domains. Drives the color bar beside the art, and tints the
   * placeholder when no art resolves. Omit to drop the bar entirely.
   */
  domains?: string[];
  /**
   * Live domain colors from `useDomainColors()`. Lift the hook to the list and
   * pass the result down — a subscription per row is what this primitive exists
   * to avoid. Falls back to the seed colors.
   */
  domainColors?: Record<string, string>;
  /** Rarity slug. Shows a rarity icon in the meta column, and watermarks the placeholder. */
  rarity?: string | null;
  /** Live rarity labels from `useEnumOrders().labels.rarities`, for the icon's tooltip. */
  rarityLabels?: Record<string, string>;
  /** Set / collector code, shown in the meta column. */
  shortCode?: string | null;
  /** Native `<img loading>` hint. Pass `"lazy"` in long lists. */
  loading?: "eager" | "lazy";
  /** Layout utilities for the cluster itself, e.g. `"self-stretch"`. */
  className?: string;
  /** Sizing for the art strip. Defaults to the strip's own `h-6`. */
  artClassName?: string;
  /**
   * Width of the rarity / short-code column, so rows in one list align. Defaults
   * to `w-20`, which fits the longest short codes at `text-xs`.
   */
  metaClassName?: string;
  /**
   * Drop the rarity / short-code column below `sm`. Long rows (deck lists, card
   * tables) need the width back on phones; short ones can keep it.
   */
  hideMetaOnMobile?: boolean;
}

/**
 * The lead of a card list row: a wide art strip, the card's domain color bar,
 * and an optional rarity icon + short code.
 *
 * This is the app's one small-card treatment outside the browsing grids. Art
 * sits in a `strip`-shaped {@link CardArtThumb}, so battlefields show whole and
 * portrait cards crop to their illustration. Everything after the art is
 * opt-in: pass `domains` for the bar, `rarity` and/or `shortCode` for the meta
 * column, and omit what a given row has no data for.
 *
 * Both `domainColors` and `rarityLabels` are props rather than hook calls on
 * purpose. The lists this leads run to hundreds of rows, and a `useDomainColors`
 * subscription per row is exactly the cost the lifted-display pattern avoids
 * (see `useCardThumbnailDisplay`). Read them once at the list and thread them down.
 *
 * @returns The row-lead cluster.
 */
export function CardMiniRow({
  src,
  imageId,
  variant = "120w",
  alt = "",
  landscape = false,
  domains,
  domainColors,
  rarity,
  rarityLabels,
  shortCode,
  loading,
  className,
  artClassName,
  metaClassName = "w-20",
  hideMetaOnMobile = false,
}: CardMiniRowProps) {
  const rarityIcon = rarity ? getFilterIconPath("rarities", rarity) : undefined;
  const showMeta = Boolean(rarityIcon) || Boolean(shortCode);
  const showBar = domains !== undefined && domains.length > 0;

  return (
    <span className={cn("flex min-w-0 items-stretch gap-1.5", className)}>
      <CardArtThumb
        shape="strip"
        src={src}
        imageId={imageId}
        variant={variant}
        alt={alt}
        landscape={landscape}
        rarity={rarity}
        domains={domains}
        loading={loading}
        className={artClassName}
      />

      {showBar && (
        <span
          aria-hidden
          className="w-0.5 shrink-0 self-stretch rounded-full"
          style={getPipBackgroundStyle(domains, domainColors)}
        />
      )}

      {showMeta && (
        <span
          className={cn(
            "shrink-0 items-center gap-1.5",
            hideMetaOnMobile ? "hidden sm:flex" : "flex",
            metaClassName,
          )}
        >
          {rarityIcon && (
            <img
              src={rarityIcon}
              alt=""
              title={rarity && rarityLabels ? rarityLabels[rarity] : undefined}
              className="size-3.5 shrink-0"
            />
          )}
          {shortCode && (
            <span className="text-muted-foreground truncate font-mono text-xs">{shortCode}</span>
          )}
        </span>
      )}
    </span>
  );
}
