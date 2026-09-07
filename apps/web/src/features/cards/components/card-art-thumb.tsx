import type { ImageVariant } from "@openrift/shared/image-url";
import { imageUrl } from "@openrift/shared/image-url";
import { ImageOffIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { FoilOverlay } from "@/features/cards/components/foil-overlay";
import { CARD_BORDER_RADIUS } from "@/features/cards/lib/card-grid-constants";
import { getDomainColor } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { LANDSCAPE_ROTATION_STYLE } from "@/lib/images";
import { cn } from "@/lib/utils";

/** `card`: portrait frame, rotates landscape art -90°. `strip`: landscape-card
 * ratio crop. `square`: square crop of the art's top. */
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
  shape?: CardArtThumbShape;
  src?: string | null;
  imageId?: string | null;
  variant?: ImageVariant;
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
  rarity?: string | null;
  domains?: string[];
  fallback?: ReactNode;
  landscape?: boolean;
  foil?: boolean;
}

function domainFillStyle(domains?: string[]): React.CSSProperties | undefined {
  const [firstDomain, secondDomain] = domains ?? [];
  if (firstDomain === undefined) {
    return undefined;
  }
  const from = getDomainColor(firstDomain);
  const to = secondDomain === undefined ? from : getDomainColor(secondDomain);
  // Alpha suffixes: `cc` ≈ 80%, `80` ≈ 50%. Strong enough to read as the domain
  // color at 40px, with a diagonal falloff so it looks designed, not flat.
  return { backgroundImage: `linear-gradient(135deg, ${from}cc, ${to}80)` };
}

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

/** Image-only card frame. For the full grid thumbnail (pricing, sibling
 * fan-out, shimmering foil) use `CardThumbnail` instead. */
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
