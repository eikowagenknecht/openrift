import type { Finish, Printing } from "@openrift/shared";
import { WellKnown, getOrientation } from "@openrift/shared";
import { useDrag } from "@use-gesture/react";
import { ArrowLeftIcon, SparkleIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { CardText } from "@/components/cards/card-text";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useFoilGyroscope } from "@/hooks/use-foil-gyroscope";
import { getDomainGradientStyle, getDomainTintStyle } from "@/lib/domain";
import { formatPublicCode } from "@/lib/format";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { CardDetailHeading } from "./card-detail-heading";
import { CardFooter } from "./card-footer";
import { CardImage } from "./card-image";
import { OwnedCollectionsPopover } from "./owned-collections-popover";
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

  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);

  const gyro = useFoilGyroscope();

  const tiltMode = IS_COARSE_POINTER
    ? gyro.available && gyro.permissionState === "granted"
      ? ("gyro" as const)
      : ("none" as const)
    : ("pointer" as const);

  const tilt = useCardTilt({
    mode: tiltMode,
    enabled: cardTilt && (!IS_COARSE_POINTER || isFoil),
    gyro,
  });

  const showFoil = isFoil && foilEffect;
  // Detail pane always uses animated foil — shimmers when tilt unavailable.
  const showShimmer = showFoil && (!cardTilt || (IS_COARSE_POINTER && tiltMode === "none"));

  return (
    <div
      className="bg-background overflow-y-auto rounded-lg px-3"
      style={getDomainTintStyle(card.domains)}
    >
      {/* Mobile header */}
      <div className="border-border/30 sticky top-0 z-10 border-b p-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <ArrowLeftIcon className="size-4" />
          </Button>
          <CardDetailHeading
            printing={printing}
            setNumber={setNumber}
            onTagClick={onTagClick}
            truncate
          />
          <OwnedCollectionsPopover
            printingId={printing.id}
            cardName={card.name}
            shortCode={printing.shortCode}
          />
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <CardDetailHeading printing={printing} setNumber={setNumber} onTagClick={onTagClick} />
        <div className="flex shrink-0 items-center gap-1">
          <OwnedCollectionsPopover
            printingId={printing.id}
            cardName={card.name}
            shortCode={printing.shortCode}
          />
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        {/* Ban banner */}
        {card.bans.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            {card.bans.map((ban) => (
              <div key={ban.formatId}>
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  Banned in {ban.formatName} since {ban.bannedAt}
                </p>
                {ban.reason && <p className="text-muted-foreground mt-0.5 text-sm">{ban.reason}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Card image */}
        <div ref={imageSwipeRef}>
          <div ref={tilt.containerRef} style={tilt.style}>
            <CardImage
              innerRef={tilt.innerRef}
              printing={printing}
              orientation={orientation}
              showImages={showImages}
              showFoil={showFoil}
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
          {!card.domains.includes(WellKnown.domain.COLORLESS) &&
            card.domains.map((d) => (
              <Tooltip key={d}>
                <TooltipTrigger>
                  <img
                    src={`/images/domains/${d.toLowerCase()}.webp`}
                    alt={d}
                    width={64}
                    height={64}
                    className="size-5"
                  />
                </TooltipTrigger>
                <TooltipContent>{d}</TooltipContent>
              </Tooltip>
            ))}
          <Tooltip>
            <TooltipTrigger>
              <img
                src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
                alt={printing.rarity}
                width={28}
                height={28}
                className="size-5"
              />
            </TooltipTrigger>
            <TooltipContent>{printing.rarity}</TooltipContent>
          </Tooltip>
          {isFoil && (
            <Tooltip>
              <TooltipTrigger>
                <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
                  <SparkleIcon className="size-3.5 fill-amber-400 text-amber-400" />
                  Foil
                </span>
              </TooltipTrigger>
              <TooltipContent>Foil finish</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Text */}
        <div className="space-y-3 pt-2">
          {printing.printedRulesText && (
            <div className="border-border/50 bg-muted/30 rounded-lg border px-3 py-2.5">
              <p className="text-muted-foreground text-sm">
                <CardText text={printing.printedRulesText} onKeywordClick={onKeywordClick} />
              </p>
              {card.errata?.correctedRulesText &&
                card.errata.correctedRulesText !== printing.printedRulesText && (
                  <PrintedTextWarning />
                )}
            </div>
          )}

          {(printing.printedEffectText || (card.mightBonus !== null && card.mightBonus > 0)) && (
            <div
              className="border-border/50 rounded-lg border px-3 py-2.5"
              style={getDomainGradientStyle(card.domains, "18")}
            >
              {printing.printedEffectText && (
                <p className="text-muted-foreground text-sm">
                  <CardText text={printing.printedEffectText} onKeywordClick={onKeywordClick} />
                </p>
              )}
              {card.errata?.correctedEffectText &&
                card.errata.correctedEffectText !== printing.printedEffectText && (
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
            <p className="text-muted-foreground/70 px-1 text-sm italic">{printing.flavorText}</p>
          )}
        </div>

        {/* Footer */}
        <CardFooter printing={printing} />

        {/* Printings */}
        {printings && printings.length > 1 && onSelectPrinting && (
          <PrintingPicker current={printing} printings={printings} onSelect={onSelectPrinting} />
        )}
      </div>
    </div>
  );
}
