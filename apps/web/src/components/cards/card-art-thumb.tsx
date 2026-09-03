import type { ImageVariant } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { ImageOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { getDomainColor } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { LANDSCAPE_ROTATION_STYLE } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * Which frame the art sits in.
 *
 * - `card` — the canonical portrait card frame (`aspect-card`). Landscape art is
 *   rotated -90° to fill it. Use where the thumb stands in for the card object
 *   itself: covers, tier tiles, stats tables, floating previews.
 * - `strip` — a wide crop at the exact landscape-card ratio (88/63), so
 *   battlefield art fills it edge to edge while portrait art crops to its
 *   illustration band. Use as the lead of a list row.
 * - `square` — a square crop of the art's top. Use where a card stands in for a
 *   legend at avatar size, in a row of them or beside a name.
 */
type CardArtThumbShape = "card" | "strip" | "square";

const FRAME_CLASS: Record<CardArtThumbShape, string> = {
  card: "bg-muted aspect-card",
  strip: "bg-muted/30 aspect-[88/63] h-6 rounded-sm border",
  square: "bg-muted/30 ring-border aspect-square size-6 rounded-sm ring-1 ring-inset",
};

const CROP_CLASS: Partial<Record<CardArtThumbShape, string>> = {
  strip: "object-[50%_18%]",
  square: "object-top",
};

interface CardArtThumbProps {
  /** Frame shape. Defaults to `"card"`. */
  shape?: CardArtThumbShape;
  /**
   * Pre-built image URL. Use when you only have a denormalized URL (e.g. price
   * data from the API), not an image id. Takes precedence over `imageId`.
   */
  src?: string | null;
  /** Image id resolved through {@link imageUrl} at `variant`. Ignored when `src` is set. */
  imageId?: string | null;
  /** Variant requested when resolving `imageId`. Pick by the rendered pixel width. */
  variant?: ImageVariant;
  /** Alt text. Leave empty for decorative thumbnails. */
  alt?: string;
  /**
   * Sizing / layout utilities applied to the frame, e.g. `"w-10"`, `"h-32"`,
   * `"h-12 self-start"`. Pass a width or a height; the other axis follows the
   * frame's aspect ratio. A `strip` frame defaults to `h-6` when neither is given.
   */
  className?: string;
  /** Native `<img loading>` hint. */
  loading?: "eager" | "lazy";
  /**
   * Rarity slug of the card. When set (and no image resolves), the empty frame
   * shows a faded rarity-icon watermark instead of the generic no-image glyph,
   * so an art-less tile still reads as a card of that rarity.
   */
  rarity?: string | null;
  /**
   * The card's domains. When set (and no image resolves), the empty frame is
   * tinted with the domain color(s) so an art-less tile still carries the
   * card's identity. Uses the default seed colors, so it stays a pure,
   * SSR-identical presentational component (no domain-color data hook).
   */
  domains?: string[];
  /** Rendered inside the frame when there is no image. Overrides the default placeholder. */
  fallback?: ReactNode;
  /**
   * Landscape cards (Battlefields) are stored as landscape images. Derive it
   * from `getOrientation(card.types) === "landscape"`. What it does depends on
   * the shape: a `card` frame rotates the art -90° to fill the portrait frame,
   * while `strip` and `square` skip the portrait crop, a strip because it is
   * already the landscape-card ratio and the art fills it exactly.
   */
  landscape?: boolean;
  /**
   * Foil printing: an amber ring on the frame and a static rainbow wash over
   * the art. Never the shimmer keyframe — the surfaces that show a foil this
   * small are lists, and an animated gradient per row is not worth the paint.
   */
  foil?: boolean;
}

/**
 * A clearly visible domain fill for the tiny placeholder: a diagonal gradient
 * from the domain color (or a two-color diagonal for a dual-domain card). Uses
 * a strong alpha on purpose — the soft `getDomainTintStyle` (tuned for large
 * card surfaces) reads as plain grey at thumbnail size. `getDomainColor` falls
 * back to the seed colors, so this stays a pure, SSR-identical function.
 * @returns The inline background style, or undefined when there are no domains.
 */
function domainFillStyle(domains?: string[]): React.CSSProperties | undefined {
  if (!domains || domains.length === 0) {
    return undefined;
  }
  const from = getDomainColor(domains[0]);
  const to = domains.length > 1 ? getDomainColor(domains[1]) : from;
  // Alpha suffixes: `cc` ≈ 80%, `80` ≈ 50%. Strong enough to read as the domain
  // color at 40px, with a diagonal falloff so it looks designed, not flat.
  return { backgroundImage: `linear-gradient(135deg, ${from}cc, ${to}80)` };
}

/**
 * The default empty-frame content: a domain-color fill behind a faded
 * rarity-icon watermark (or a generic no-image glyph when the rarity is
 * unknown). Keeps art-less tiles looking intentional rather than broken.
 * Everything is derived purely from props, so it renders identically on server
 * and client.
 * @returns The placeholder element.
 */
function ThumbPlaceholder({
  rarity,
  domains,
  shape,
}: {
  rarity?: string | null;
  domains?: string[];
  shape: CardArtThumbShape;
}) {
  const rarityIcon = rarity ? getFilterIconPath("rarities", rarity) : undefined;
  // Constrain one axis only, and pick the *short* one, so the square icon keeps
  // its intrinsic 1:1 ratio instead of being stretched by the frame. A `card`
  // frame is portrait, so width is the short axis; a `strip` is wide, so height
  // is. A `size-1/2` (both axes) would distort in either.
  const glyphSize = shape === "strip" ? "h-1/2" : "w-1/2";
  return (
    <span
      className="absolute inset-0 flex items-center justify-center"
      style={domainFillStyle(domains)}
    >
      {rarityIcon ? (
        <img src={rarityIcon} alt="" aria-hidden className={cn(glyphSize, "opacity-25")} />
      ) : (
        <ImageOffIcon className={cn("text-muted-foreground/40", glyphSize)} aria-hidden />
      )}
    </span>
  );
}

/**
 * A card image locked to a fixed aspect ratio and cropped with `object-cover`,
 * so it can never distort however the frame is sized. Size it with a width or
 * height utility in `className`; the other axis follows the ratio.
 * `inline-block` keeps the aspect-driven axis content-sized in both flex and
 * block contexts.
 *
 * Three shapes, picked with `shape` — see {@link CardArtThumbShape}. All share
 * one fallback chain, so the three ways art can be absent (no printing
 * resolved, a printing with no image on file, and an image record whose file is
 * missing on the server) all land in the same domain-tinted placeholder instead
 * of the browser's broken-image glyph.
 *
 * For the full grid thumbnail (pricing, sibling fan-out, the shimmering foil)
 * use `CardThumbnail` instead — this is the lightweight, image-only frame for
 * lists, tooltips, and stats, and its `foil` is the still version. To lead a
 * list row with art plus the card's domain / rarity / short code, use
 * `CardMiniRow`, which wraps this.
 *
 * @returns The framed card thumbnail element.
 */
export function CardArtThumb({
  shape = "card",
  src,
  imageId,
  variant = "120w",
  alt = "",
  className,
  loading,
  rarity,
  domains,
  fallback,
  landscape = false,
  foil = false,
}: CardArtThumbProps) {
  const framed = shape === "card";
  const resolved = src ?? (imageId ? imageUrl(imageId, variant) : null);
  const emptyFrame = fallback ?? (
    <ThumbPlaceholder rarity={rarity} domains={domains} shape={shape} />
  );
  const image = resolved && (
    <ImgWithFallback
      src={resolved}
      alt={alt}
      loading={loading}
      className={cn("size-full object-cover", !landscape && CROP_CLASS[shape])}
      fallback={emptyFrame}
    />
  );
  // Rotation only ever applies to the portrait frame; the other shapes take
  // battlefield art as-is.
  const rotate = landscape && framed;
  return (
    <span
      data-slot="card-art-thumb"
      className={cn(
        "relative inline-block shrink-0 overflow-hidden align-top",
        FRAME_CLASS[shape],
        foil && "ring-border-accent/60 ring-1",
        className,
      )}
      style={framed ? { borderRadius: CARD_BORDER_RADIUS } : undefined}
    >
      {image ? (
        rotate ? (
          // Landscape art is rotated to fill the portrait frame — mirrors the
          // rotated branch of CardThumbnail's CardArtImage.
          <span
            className="absolute top-1/2 left-1/2 overflow-hidden"
            style={LANDSCAPE_ROTATION_STYLE}
          >
            {image}
          </span>
        ) : (
          image
        )
      ) : (
        emptyFrame
      )}
      {/* Radius and clipping stay on the frame and the overlay's transform two
          levels in. Combining them on one element mis-sizes it in Firefox. */}
      {foil && <FoilOverlay active shimmer={false} />}
    </span>
  );
}
