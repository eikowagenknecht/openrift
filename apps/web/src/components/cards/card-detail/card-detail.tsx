import type { Printing } from "@openrift/shared";
import { WellKnown, getOrientation } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useDrag } from "@use-gesture/react";
import { ExternalLinkIcon, ShieldIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { CardText } from "@/components/cards/card-text";
import { FinishIcon, hasFinishIcon } from "@/components/cards/finish-icon";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainGradientStyle, getDomainTintStyle } from "@/lib/domain";
import { formatPublicCode } from "@/lib/format";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { CardDetailHeading } from "./card-detail-heading";
import { CardFooter } from "./card-footer";
import { CardImage } from "./card-image";
import { ErrataNotice } from "./errata-notice";
import { PrintingNotesSection } from "./printing-notes-section";
import { PrintingPicker } from "./printing-picker";
import { StatChip } from "./stat-chip";

interface CardDetailProps {
  printing: Printing;
  onClose?: () => void;
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
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const setNumber = formatPublicCode(printing);
  const imageSwipeRef = useRef<HTMLDivElement>(null);
  const orientation = getOrientation(card.type);
  const isFoil = printing.finish === WellKnown.finish.FOIL;

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

  const tiltMode = IS_COARSE_POINTER ? ("none" as const) : ("pointer" as const);

  // Destructure into locals so React Compiler's ref heuristic doesn't flag
  // property access on the hook result — see the note in card-thumbnail.tsx.
  const { containerRef: tiltContainerRef, innerRef: tiltInnerRef } = useCardTilt({
    mode: tiltMode,
    enabled: cardTilt && (!IS_COARSE_POINTER || isFoil),
  });

  const { data: isAdmin } = useIsAdmin();

  const showFoil = isFoil && foilEffect;
  // Detail pane always uses animated foil — shimmers when tilt unavailable.
  const showShimmer = showFoil && (!cardTilt || IS_COARSE_POINTER);

  return (
    <div
      className="bg-background overflow-y-auto rounded-lg px-3"
      style={getDomainTintStyle(card.domains, domainColors)}
    >
      {/* Mobile header */}
      {onClose && (
        <div className="border-border/30 sticky top-0 z-10 border-b p-4 backdrop-blur md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close card details"
            className="absolute top-4 right-4"
          >
            <XIcon className="size-4" />
          </Button>
          <CardDetailHeading
            printing={printing}
            setNumber={setNumber}
            onTagClick={onTagClick}
            truncate
            titleClassName="pr-8"
          />
        </div>
      )}

      {/* Desktop header */}
      <div className="relative hidden md:block md:pt-4 md:pb-4">
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close card details"
            className="absolute top-4 right-0"
          >
            <XIcon className="size-4" />
          </Button>
        )}
        <CardDetailHeading
          printing={printing}
          setNumber={setNumber}
          onTagClick={onTagClick}
          titleClassName={onClose ? "pr-8" : undefined}
        />
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
          <div ref={tiltContainerRef}>
            <CardImage
              innerRef={tiltInnerRef}
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
          {hasFinishIcon(printing.finish) && (
            <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
              <FinishIcon finish={printing.finish} />
              {labels.finishes[printing.finish] ?? printing.finish}
            </span>
          )}
        </div>

        {/* Text */}
        <div className="space-y-3 pt-2">
          {printing.printedRulesText && (
            <div className="border-border/50 bg-muted/30 rounded-lg border px-3 py-2.5">
              <p className="text-muted-foreground text-sm">
                <CardText
                  text={card.errata?.correctedRulesText ?? printing.printedRulesText}
                  onKeywordClick={onKeywordClick}
                />
              </p>
              {card.errata?.correctedRulesText &&
                card.errata.correctedRulesText !== printing.printedRulesText && (
                  <ErrataNotice
                    printedText={printing.printedRulesText}
                    source={card.errata.source}
                    sourceUrl={card.errata.sourceUrl}
                    effectiveDate={card.errata.effectiveDate}
                    onKeywordClick={onKeywordClick}
                  />
                )}
            </div>
          )}

          {(printing.printedEffectText || (card.mightBonus !== null && card.mightBonus > 0)) && (
            <div
              className="border-border/50 rounded-lg border px-3 py-2.5"
              style={getDomainGradientStyle(card.domains, "18", domainColors)}
            >
              {printing.printedEffectText && (
                <p className="text-muted-foreground text-sm">
                  <CardText
                    text={card.errata?.correctedEffectText ?? printing.printedEffectText}
                    onKeywordClick={onKeywordClick}
                  />
                </p>
              )}
              {card.errata?.correctedEffectText &&
                printing.printedEffectText &&
                card.errata.correctedEffectText !== printing.printedEffectText && (
                  <ErrataNotice
                    printedText={printing.printedEffectText}
                    source={card.errata.source}
                    sourceUrl={card.errata.sourceUrl}
                    effectiveDate={card.errata.effectiveDate}
                    onKeywordClick={onKeywordClick}
                  />
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

        {/* Distribution & printing notes (markers, channels, per-printing comment) */}
        <PrintingNotesSection printing={printing} />

        {/* Footer */}
        <CardFooter printing={printing} />

        {/* Printings */}
        {printings && printings.length > 1 && onSelectPrinting && (
          <PrintingPicker current={printing} printings={printings} onSelect={onSelectPrinting} />
        )}

        {/* Card details link (only in side pane, not on standalone page) */}
        {onClose && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              to="/cards/$cardSlug"
              params={{ cardSlug: card.slug }}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
            >
              <ExternalLinkIcon className="size-3" />
              View card details
            </Link>
            {isAdmin && (
              <Link
                to="/admin/cards/$cardSlug"
                params={{ cardSlug: card.slug }}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
              >
                <ShieldIcon className="size-3" />
                Admin view
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
