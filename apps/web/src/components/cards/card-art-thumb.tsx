import type { ImageVariant } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import type { ReactNode } from "react";

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
  /** Rendered inside the frame when there is no image. Defaults to the empty muted frame. */
  fallback?: ReactNode;
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
  fallback,
}: CardArtThumbProps) {
  const resolved = src ?? (imageId ? imageUrl(imageId, variant) : null);
  return (
    <span
      className={cn(
        "bg-muted aspect-card relative inline-block shrink-0 overflow-hidden rounded align-top",
        className,
      )}
    >
      {resolved ? (
        <img src={resolved} alt={alt} loading={loading} className="size-full object-cover" />
      ) : (
        fallback
      )}
    </span>
  );
}
