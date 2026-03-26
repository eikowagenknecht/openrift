import type { Finish, Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { useDrag } from "@use-gesture/react";
import { ArrowLeft, X } from "lucide-react";
import { useRef } from "react";

import { CardText } from "@/components/cards/card-text";
import { Button } from "@/components/ui/button";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useFoilGyroscope } from "@/hooks/use-foil-gyroscope";
import { getDomainGradientStyle, getDomainTintStyle } from "@/lib/domain";
import { formatPublicCode } from "@/lib/format";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";

import { CardDetailHeading } from "./card-detail-heading";
import { CardFooter } from "./card-footer";
import { CardImage } from "./card-image";
import { PrintedTextWarning } from "./printed-text-warning";
import { PrintingPicker } from "./printing-picker";
import { StatChip } from "./stat-chip";

interface CardDetailProps {
  printing: Printing;
  onClose: () => void;
  showImages?: boolean;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  onTagClick?: (tag: string) => void;
  onKeywordClick?: (keyword: string) => void;
  printings?: Printing[];
  onSelectPrinting?: (printing: Printing) => void;
}

export function CardDetail({
  printing,
  onClose,
  showImages,
  onPrevCard,
  onNextCard,
  onTagClick,
  onKeywordClick,
  printings,
  onSelectPrinting,
}: CardDetailProps) {
  const { card } = printing;
  const setNumber = formatPublicCode(printing);
  const imageSwipeRef = useRef<HTMLDivElement>(null);
  const orientation = getOrientation(card.type);
  const isFoil = printing.finish === ("foil" satisfies Finish);

  useDrag(
    ({ last, movement: [dx, dy], swipe: [swipeX] }) => {
      if (!last) {
        return;
      }
      // swipe detected by the library (velocity-based)
      if (swipeX === 1 && onPrevCard) {
        onPrevCard();
      } else if (swipeX === -1 && onNextCard) {
        onNextCard();
      } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        // fallback: distance-based threshold
        if (dx > 0 && onPrevCard) {
          onPrevCard();
        } else if (dx < 0 && onNextCard) {
          onNextCard();
        }
      }
    },
    {
      target: imageSwipeRef,
      enabled: IS_COARSE_POINTER,
      filterTaps: true,
      axis: "lock",
    },
  );

  const gyro = useFoilGyroscope();

  const foilMode = IS_COARSE_POINTER
    ? gyro.available && gyro.permissionState === "granted"
      ? ("gyro" as const)
      : ("none" as const)
    : ("pointer" as const);

  const tilt = useCardTilt({ mode: foilMode, enabled: !IS_COARSE_POINTER || isFoil, gyro });
  const showShimmer = IS_COARSE_POINTER && foilMode === "none";

  return (
    <div
      className="overflow-y-auto bg-background rounded-lg px-3"
      style={getDomainTintStyle(card.domains)}
    >
      {/* Mobile header */}
      <div className="sticky top-0 z-10 border-b border-border/30 p-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <ArrowLeft className="size-4" />
          </Button>
          <CardDetailHeading
            printing={printing}
            setNumber={setNumber}
            onTagClick={onTagClick}
            truncate
          />
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <CardDetailHeading printing={printing} setNumber={setNumber} onTagClick={onTagClick} />
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        {/* Card image */}
        <div ref={imageSwipeRef}>
          <div ref={tilt.containerRef} style={tilt.style}>
            <CardImage
              innerRef={tilt.innerRef}
              printing={printing}
              orientation={orientation}
              showImages={showImages}
              showFoil={isFoil}
              tiltActive={tilt.active}
              showShimmer={showShimmer}
            />
          </div>
        </div>
        {/* Stats */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {card.energy !== null && card.energy > 0 && (
            <StatChip label="Energy" value={card.energy} />
          )}
          {card.power !== null && card.power > 0 && (
            <StatChip label="Power" value={card.power} icon="/images/power.svg" />
          )}
          {card.might !== null && (
            <StatChip label="Might" value={card.might} icon="/images/might.svg" />
          )}
          {!card.domains.includes("Colorless") &&
            card.domains.map((d) => (
              <img
                key={d}
                src={`/images/domains/${d.toLowerCase()}.webp`}
                alt={d}
                title={d}
                width={64}
                height={64}
                className="size-5"
              />
            ))}
          <img
            src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
            alt={printing.rarity}
            title={printing.rarity}
            width={28}
            height={28}
            className="size-5"
          />
        </div>

        {/* Text */}
        <div className="space-y-3 pt-2">
          {printing.printedRulesText && (
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
              <p className="text-sm text-muted-foreground">
                <CardText text={printing.printedRulesText} onKeywordClick={onKeywordClick} />
              </p>
              {card.rulesText && card.rulesText !== printing.printedRulesText && (
                <PrintedTextWarning />
              )}
            </div>
          )}

          {(printing.printedEffectText || (card.mightBonus !== null && card.mightBonus > 0)) && (
            <div
              className="rounded-lg border border-border/50 px-3 py-2.5"
              style={getDomainGradientStyle(card.domains, "18")}
            >
              {printing.printedEffectText && (
                <p className="text-sm text-muted-foreground">
                  <CardText text={printing.printedEffectText} onKeywordClick={onKeywordClick} />
                </p>
              )}
              {card.effectText && card.effectText !== printing.printedEffectText && (
                <PrintedTextWarning />
              )}
              {card.mightBonus !== null && card.mightBonus > 0 && (
                <div className={cn(printing.printedEffectText && "mt-2")}>
                  <StatChip
                    label="Might Bonus"
                    value={`+${card.mightBonus}`}
                    icon="/images/might.svg"
                  />
                </div>
              )}
            </div>
          )}

          {printing.flavorText && (
            <p className="px-1 text-sm italic text-muted-foreground/70">{printing.flavorText}</p>
          )}
        </div>

        {/* Footer */}
        <CardFooter printing={printing} />

        {/* Versions */}
        {printings && printings.length > 1 && onSelectPrinting && (
          <PrintingPicker current={printing} printings={printings} onSelect={onSelectPrinting} />
        )}
      </div>
    </div>
  );
}
