import type { Printing } from "@openrift/shared";

import { CardText } from "@/components/cards/card-text";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainGradientStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";

import { ErrataNotice } from "./errata-notice";
import { StatChip } from "./stat-chip";

/**
 * Printed rules text, effect text and flavor, each with its errata notice when
 * the card has one.
 * @returns The card's text blocks.
 */
export function CardDetailText({
  printing,
  onKeywordClick,
}: {
  printing: Printing;
  onKeywordClick?: (keyword: string) => void;
}) {
  const { card } = printing;
  const domainColors = useDomainColors();

  return (
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
  );
}
