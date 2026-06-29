import type { Printing } from "@openrift/shared";
import { WellKnown, getOrientation } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ShieldIcon,
  XIcon,
} from "lucide-react";

import { CardText } from "@/components/cards/card-text";
import { FinishIcon, hasFinishIcon } from "@/components/cards/finish-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-admin";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainGradientStyle, getDomainTintStyle } from "@/lib/domain";
import { formatPublicCode } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
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
  const orientation = getOrientation(card.type);
  const isFoil = printing.finish === WellKnown.finish.FOIL;
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);

  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);

  // Hook over the IS_COARSE_POINTER module constant so SSR and the first
  // client render agree — `showShimmer` flips the foil overlay's animation
  // class on coarse-pointer devices and would otherwise abort hydration.
  const coarsePointer = useCoarsePointer();

  const tiltMode = coarsePointer ? ("none" as const) : ("pointer" as const);

  // Destructure into locals so React Compiler's ref heuristic doesn't flag
  // property access on the hook result — see the note in card-thumbnail.tsx.
  const { containerRef: tiltContainerRef, innerRef: tiltInnerRef } = useCardTilt({
    mode: tiltMode,
    enabled: cardTilt && (!coarsePointer || isFoil),
  });

  const { data: isAdmin } = useIsAdmin();

  const showFoil = isFoil && foilEffect;
  // Detail pane always uses animated foil — shimmers when tilt unavailable.
  const showShimmer = showFoil && (!cardTilt || coarsePointer);

  return (
    <div
      className="bg-background overflow-y-auto rounded-lg md:px-3"
      style={getDomainTintStyle(card.domains, domainColors)}
    >
      {/* Mobile header */}
      {onClose && (
        <div className="border-border/30 sticky top-0 z-10 border-b px-4 pt-3 pb-4 backdrop-blur md:hidden">
          {/* Drag pill hosted inside the blurred header so the blur band reaches the
              drawer's top edge (the drawer's built-in pill is suppressed via hideHandle). */}
          <div className="bg-muted mx-auto mb-3 h-1 w-[100px] rounded-full" />
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close card details"
              className="absolute top-0 right-0"
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
          <Alert variant="destructive" className="space-y-1.5">
            {card.bans.map((ban) => (
              <div key={ban.formatId}>
                <AlertTitle>
                  Banned in {ban.formatName} since {ban.bannedAt}
                </AlertTitle>
                {ban.reason && <AlertDescription className="mt-0.5">{ban.reason}</AlertDescription>}
              </div>
            ))}
          </Alert>
        )}

        {/* Card image */}
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
        {/* Stats with mobile prev/next on the sides */}
        <div className="flex items-start gap-2">
          {(onPrevCard || onNextCard) && (
            <Button
              variant="outline"
              size="icon"
              onClick={onPrevCard}
              disabled={!onPrevCard}
              aria-label="Previous card"
              className="md:hidden"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
          )}
          <div className="flex min-h-8 flex-1 flex-wrap items-center justify-center gap-1.5">
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
              card.domains.map((d) => {
                const domainIcon = getFilterIconPath("domains", d);
                return domainIcon ? (
                  <img
                    key={d}
                    src={domainIcon}
                    alt={d}
                    title={d}
                    width={64}
                    height={64}
                    className="size-5"
                  />
                ) : null;
              })}
            {rarityIcon && (
              <img
                src={rarityIcon}
                alt={printing.rarity}
                title={printing.rarity}
                width={28}
                height={28}
                className="size-5"
              />
            )}
            {hasFinishIcon(printing.finish) && (
              <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
                <FinishIcon finish={printing.finish} />
                {labels.finishes[printing.finish] ?? printing.finish}
              </span>
            )}
            {printing.size !== WellKnown.cardSize.STANDARD && (
              <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
                {labels.cardSizes[printing.size] ?? printing.size}
              </span>
            )}
          </div>
          {(onPrevCard || onNextCard) && (
            <Button
              variant="outline"
              size="icon"
              onClick={onNextCard}
              disabled={!onNextCard}
              aria-label="Next card"
              className="md:hidden"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
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
        {printings && printings.length > 0 && onSelectPrinting && (
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
