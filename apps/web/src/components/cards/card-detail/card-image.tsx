import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

export function CardImage({
  innerRef,
  printing,
  orientation,
  showImages,
  showFoil,
  showShimmer,
}: {
  innerRef: React.RefCallback<HTMLElement>;
  printing: Printing;
  orientation: "portrait" | "landscape";
  showImages?: boolean;
  showFoil: boolean;
  showShimmer: boolean;
}) {
  const { card } = printing;
  const frontImage = printing.images[0] ?? null;
  const hasImage = Boolean(showImages && frontImage);
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    // Outer wrapper owns overflow-hidden + border-radius. The inner div owns
    // the 3D tilt transform. Keeping overflow-hidden and transform on separate
    // elements works around a Firefox bug that mis-sizes absolutely-positioned
    // descendants (like the Preview ribbon) when both are on the same element.
    <div
      className="relative overflow-hidden"
      style={{
        // Percentage border-radius creates elliptical corners on non-square
        // elements. Use the / syntax to keep corners circular: horizontal
        // radius is 5% of width, vertical is scaled by the card aspect
        // ratio (63/88) so both resolve to the same pixel value.
        // 5% covers the range of built-in artwork corner radii (~3.9-4.7%).
        borderRadius: "5% / 3.6%",
      }}
    >
      <div
        ref={innerRef}
        style={{
          borderRadius: "inherit",
          transform:
            "perspective(1000px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
          transformStyle: "preserve-3d",
        }}
      >
        {hasImage && frontImage ? (
          <>
            <div className="aspect-card" />
            {needsCssRotation(orientation) ? (
              <div
                className={cn(
                  "absolute top-1/2 left-1/2 overflow-hidden transition-opacity duration-300",
                  imgLoaded ? "opacity-100" : "opacity-0",
                )}
                style={LANDSCAPE_ROTATION_STYLE}
              >
                <img
                  src={imageUrl(frontImage.imageId, "400w")}
                  srcSet={`${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`}
                  sizes="(min-width: 768px) 376px, 100vw"
                  width={558}
                  height={400}
                  fetchPriority="high"
                  alt={card.name}
                  className="size-full object-cover"
                  onLoad={() => setImgLoaded(true)}
                />
              </div>
            ) : (
              <img
                src={imageUrl(frontImage.imageId, "400w")}
                srcSet={`${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`}
                sizes="(min-width: 768px) 376px, 100vw"
                width={400}
                height={558}
                fetchPriority="high"
                alt={card.name}
                className={cn(
                  "absolute inset-0 block w-full transition-opacity duration-300",
                  imgLoaded ? "opacity-100" : "opacity-0",
                )}
                onLoad={() => setImgLoaded(true)}
              />
            )}
          </>
        ) : (
          <CardPlaceholderImage
            name={card.name}
            domain={card.domains}
            energy={card.energy}
            might={card.might}
            power={card.power}
            type={card.type}
            superTypes={card.superTypes}
            tags={card.tags}
            rulesText={printing.printedRulesText}
            effectText={printing.printedEffectText}
            mightBonus={card.mightBonus}
            flavorText={printing.flavorText}
            rarity={printing.rarity}
            publicCode={printing.publicCode}
            artist={printing.artist}
          />
        )}
        {showFoil && <FoilOverlay active shimmer={showShimmer} />}
        {!printing.setReleased && (
          <div
            className="@container pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit]"
            title="Previewed / Unreleased — not yet available in official play"
          >
            <div className="absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] bg-amber-500 py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider text-amber-950 uppercase shadow-md select-none">
              Preview
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
