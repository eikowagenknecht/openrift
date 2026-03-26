import type { Printing } from "@openrift/shared";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { LANDSCAPE_ROTATION_STYLE, getCardImageUrl, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

export function CardImage({
  innerRef,
  printing,
  orientation,
  showImages,
  showFoil,
  tiltActive,
  showShimmer,
}: {
  innerRef: React.RefCallback<HTMLElement>;
  printing: Printing;
  orientation: "portrait" | "landscape";
  showImages?: boolean;
  showFoil: boolean;
  tiltActive: boolean;
  showShimmer: boolean;
}) {
  const { card } = printing;
  const imageUrl = printing.images[0]?.url ?? null;
  const hasImage = showImages && imageUrl;
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div
      ref={innerRef}
      className="relative overflow-hidden"
      style={{
        // Percentage border-radius creates elliptical corners on non-square
        // elements. Use the / syntax to keep corners circular: horizontal
        // radius is 5% of width, vertical is scaled by the card aspect
        // ratio (63/88) so both resolve to the same pixel value.
        // 5% covers the range of built-in artwork corner radii (~3.9-4.7%).
        borderRadius: "5% / 3.6%",
        transform:
          "perspective(1000px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
        transformStyle: "preserve-3d",
      }}
    >
      <CardPlaceholderImage
        name={card.name}
        domain={card.domains}
        energy={card.energy}
        might={card.might}
        className={hasImage && imgLoaded ? "invisible" : undefined}
      />
      {hasImage &&
        (needsCssRotation(orientation) ? (
          <div
            className={cn(
              "absolute top-1/2 left-1/2 overflow-hidden transition-opacity duration-300",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
            style={LANDSCAPE_ROTATION_STYLE}
          >
            <img
              src={getCardImageUrl(imageUrl, "full")}
              alt={card.name}
              className="size-full object-cover"
              onLoad={() => setImgLoaded(true)}
            />
          </div>
        ) : (
          <img
            src={getCardImageUrl(imageUrl, "full")}
            alt={card.name}
            className={cn(
              "absolute inset-0 block w-full transition-opacity duration-300",
              imgLoaded ? "opacity-100" : "opacity-0",
            )}
            onLoad={() => setImgLoaded(true)}
          />
        ))}
      {showFoil && <FoilOverlay active={tiltActive} shimmer={showShimmer} />}
    </div>
  );
}
