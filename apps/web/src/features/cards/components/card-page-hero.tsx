import { imageUrl } from "@openrift/shared/image-url";
import { findStandardArtFallback } from "@openrift/shared/standard";
import type { CardDetailResponse } from "@openrift/shared/types/api/catalog";
import type { Printing } from "@openrift/shared/types/catalog";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";

import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { CardPlaceholderImage } from "@/features/cards/components/card-placeholder-image";
import { FallbackArtBadges } from "@/features/cards/components/fallback-art-badges";
import { SuggestImageNotice } from "@/features/cards/components/suggest-image-notice";

export function CardPageHero({
  card,
  printing,
  siblings,
}: {
  card: CardDetailResponse["card"];
  printing: Printing;
  siblings: Printing[];
}) {
  const frontImage = printing.images.find((i) => i.face === "front");
  const isLandscape = getOrientation(card.types) === "landscape";
  const heroWidth = isLandscape ? 558 : 400;
  const heroHeight = isLandscape ? 400 : 558;
  const heroPlaceholder = (
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
      className="w-full rounded-xl"
    />
  );

  const heroFallbackArt = findStandardArtFallback(printing, siblings);
  const heroFallback = heroFallbackArt ? (
    <div className="relative">
      <ImgWithFallback
        src={imageUrl(heroFallbackArt.image.imageId, "400w")}
        srcSet={`${imageUrl(heroFallbackArt.image.imageId, "400w")} 400w, ${imageUrl(heroFallbackArt.image.imageId, "full")} 800w`}
        sizes="(min-width: 768px) 320px, 100vw"
        width={heroWidth}
        height={heroHeight}
        fetchPriority="high"
        alt={legendDisplayName(card)}
        className="w-full rounded-xl"
        fallback={heroPlaceholder}
      />
      <FallbackArtBadges printing={printing} artPrinting={heroFallbackArt.printing} />
      <SuggestImageNotice printing={printing} />
    </div>
  ) : (
    heroPlaceholder
  );

  return (
    <div className="shrink-0 md:w-80">
      {frontImage ? (
        <ImgWithFallback
          src={imageUrl(frontImage.imageId, "400w")}
          srcSet={`${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`}
          sizes="(min-width: 768px) 320px, 100vw"
          width={heroWidth}
          height={heroHeight}
          fetchPriority="high"
          alt={legendDisplayName(card)}
          className="w-full rounded-xl"
          fallback={heroFallback}
        />
      ) : (
        heroFallback
      )}
    </div>
  );
}
