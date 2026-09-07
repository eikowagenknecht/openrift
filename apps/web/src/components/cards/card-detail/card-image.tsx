import { imageUrl } from "@openrift/shared/image-url";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FallbackArtBadges } from "@/components/cards/fallback-art-badges";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { SuggestImageNotice } from "@/components/cards/suggest-image-notice";
import { useStandardArtFallback } from "@/hooks/use-standard-art-fallback";
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
  const getFallbackArt = useStandardArtFallback();
  const frontImage = printing.images[0] ?? null;
  const [imgLoaded, setImgLoaded] = useState(false);
  // Keyed by URL, not printing id, so a reused instance retries a new printing's image.
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const markFailed = (url: string) =>
    setFailedUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
  const primarySrc = showImages && frontImage ? imageUrl(frontImage.imageId, "400w") : null;
  const fallback = showImages ? getFallbackArt(printing) : null;
  const fallbackSrc = fallback === null ? null : imageUrl(fallback.image.imageId, "400w");
  // `isSubstitute` drives the badge row, not `artSource`: `artSource` is null for
  // both the printing's own art and a pinned substitute with an unknown source.
  const shown =
    frontImage && primarySrc !== null && !failedUrls.includes(primarySrc)
      ? {
          imageId: frontImage.imageId,
          src: primarySrc,
          isSubstitute: false,
          artSource: null,
        }
      : fallback && fallbackSrc !== null && !failedUrls.includes(fallbackSrc)
        ? {
            imageId: fallback.image.imageId,
            src: fallbackSrc,
            isSubstitute: true,
            artSource: fallback.printing,
          }
        : null;
  // SSR: the browser can finish the image fetch before hydration attaches
  // load/error listeners, so check ref.complete on mount too.
  const shownSrc = shown?.src;
  const coverCachedResult = (node: HTMLImageElement | null) => {
    if (node?.complete && shownSrc !== undefined) {
      if (node.naturalWidth > 0) {
        setImgLoaded(true);
      } else {
        markFailed(shownSrc);
      }
    }
  };
  return (
    // overflow-hidden must be below the tilt element, not combined with it:
    // Firefox mis-sizes absolute descendants when overflow-hidden and preserve-3d share a node.
    <div className="relative">
      <div
        ref={innerRef}
        style={{
          // "5% / 3.6%" keeps corners circular on the non-square card (63/88 aspect);
          // a plain percentage radius would render elliptical.
          borderRadius: "5% / 3.6%",
          transform:
            "perspective(1000px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
          transformStyle: "preserve-3d",
        }}
      >
        <div className="relative overflow-hidden" style={{ borderRadius: "inherit" }}>
          {shown ? (
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
                    ref={coverCachedResult}
                    src={shown.src}
                    srcSet={`${imageUrl(shown.imageId, "400w")} 400w, ${imageUrl(shown.imageId, "full")} 800w`}
                    sizes="(min-width: 768px) 376px, 100vw"
                    width={558}
                    height={400}
                    fetchPriority="high"
                    alt={legendDisplayName(card)}
                    className="size-full object-cover"
                    onLoad={() => setImgLoaded(true)}
                    onError={() => markFailed(shown.src)}
                  />
                </div>
              ) : (
                <img
                  ref={coverCachedResult}
                  src={shown.src}
                  srcSet={`${imageUrl(shown.imageId, "400w")} 400w, ${imageUrl(shown.imageId, "full")} 800w`}
                  sizes="(min-width: 768px) 376px, 100vw"
                  width={400}
                  height={558}
                  fetchPriority="high"
                  alt={legendDisplayName(card)}
                  className={cn(
                    "absolute inset-0 block w-full transition-opacity duration-300",
                    imgLoaded ? "opacity-100" : "opacity-0",
                  )}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => markFailed(shown.src)}
                />
              )}
              {shown.isSubstitute && (
                <FallbackArtBadges printing={printing} artPrinting={shown.artSource} />
              )}
            </>
          ) : (
            <CardPlaceholderImage
              name={card.name}
              domain={card.domains}
              energy={card.energy}
              might={card.might}
              power={card.power}
              types={card.types}
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
          <SuggestImageNotice printing={printing} />
        </div>
        {showFoil && <FoilOverlay active shimmer={showShimmer} />}
        {!printing.setReleased && (
          <div
            className="@container pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit]"
            title="Not released in this language yet"
          >
            <div className="bg-warning text-warning-foreground absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider uppercase shadow-md select-none">
              Preview
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
