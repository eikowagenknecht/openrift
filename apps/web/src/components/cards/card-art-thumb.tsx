import type { ImageVariant } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { ImageOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { getDomainColor } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardArtThumbProps {
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
   * card aspect ratio.
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
function ThumbPlaceholder({ rarity, domains }: { rarity?: string | null; domains?: string[] }) {
  const rarityIcon = rarity ? getFilterIconPath("rarities", rarity) : undefined;
  return (
    <span
      className="absolute inset-0 flex items-center justify-center"
      style={domainFillStyle(domains)}
    >
      {rarityIcon ? (
        // Constrain width only — the frame is portrait (aspect-card), so a
        // `size-1/2` (both axes at 50%) would stretch the square icon taller
        // than wide. Width-only keeps the intrinsic 1:1 ratio, so it stays square.
        <img src={rarityIcon} alt="" aria-hidden className="w-1/2 opacity-25" />
      ) : (
        <ImageOffIcon className="text-muted-foreground/40 w-1/2" aria-hidden />
      )}
    </span>
  );
}

/**
 * A card image locked to the canonical card aspect ratio (`aspect-card`) and
 * cropped with `object-cover`, so it can never distort however the frame is
 * sized. Size it with a width or height utility in `className`; the other axis
 * follows the ratio. `inline-block` keeps the aspect-driven axis content-sized
 * in both flex and block contexts.
 *
 * For the full grid thumbnail (foil, pricing, sibling fan-out, landscape
 * rotation) use `CardThumbnail` instead — this is the lightweight, image-only
 * frame for lists, tooltips, and stats.
 *
 * @returns The framed card thumbnail element.
 */
export function CardArtThumb({
  src,
  imageId,
  variant = "120w",
  alt = "",
  className,
  loading,
  rarity,
  domains,
  fallback,
}: CardArtThumbProps) {
  const resolved = src ?? (imageId ? imageUrl(imageId, variant) : null);
  const emptyFrame = fallback ?? <ThumbPlaceholder rarity={rarity} domains={domains} />;
  return (
    <span
      className={cn(
        "bg-muted aspect-card relative inline-block shrink-0 overflow-hidden align-top",
        className,
      )}
      style={{ borderRadius: CARD_BORDER_RADIUS }}
    >
      {resolved ? (
        <ImgWithFallback
          src={resolved}
          alt={alt}
          loading={loading}
          className="size-full object-cover"
          fallback={emptyFrame}
        />
      ) : (
        emptyFrame
      )}
    </span>
  );
}
