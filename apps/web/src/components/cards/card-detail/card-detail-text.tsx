import type { Printing } from "@openrift/shared";

import { CardText } from "@/components/cards/card-text";
import { OrnamentBase } from "@/components/ui/ornament";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { ErrataNotice } from "./errata-notice";
import { StatChip } from "./stat-chip";

/**
 * The card's flavor line. Its own component because the stream overlay and the
 * presentation stage switch flavor on and off separately from the rules text,
 * and there it renders without the blocks above it.
 *
 * @returns The flavor line, or null when the printing has none.
 */
export function CardDetailFlavorText({ printing }: { printing: Printing }) {
  if (!printing.flavorText) {
    return null;
  }
  return <p className="text-muted-foreground/70 px-1 text-sm italic">{printing.flavorText}</p>;
}

/**
 * Printed rules text, effect text and flavor in one text box, each with its
 * errata notice when the card has one. The box closes like the printed card's:
 * the bracket base, with the rarity glyph in the medallion.
 * @returns The card's text box, or null when the printing has no text.
 */
export function CardDetailText({
  printing,
  onKeywordClick,
  showFlavorText = true,
  interactive = true,
}: {
  printing: Printing;
  onKeywordClick?: (keyword: string) => void;
  /**
   * Off for callers that render {@link CardDetailFlavorText} themselves, so a
   * flavor switch can act independently of the rules text.
   */
  showFlavorText?: boolean;
  /**
   * Off on capture surfaces (the OBS source, the presentation stage), where a
   * keyword hover state is nothing the audience can use.
   */
  interactive?: boolean;
}) {
  const { card } = printing;
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const hasEffect =
    Boolean(printing.printedEffectText) || (card.mightBonus !== null && card.mightBonus > 0);
  const hasFlavor = showFlavorText && Boolean(printing.flavorText);
  if (!printing.printedRulesText && !hasEffect && !hasFlavor) {
    return null;
  }
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);

  return (
    <div className="flex flex-col pt-2">
      <div className="bg-muted/30 border-border-accent space-y-3 rounded-t-lg border border-b-0 px-3 pt-2.5 pb-2">
        {printing.printedRulesText && (
          <div>
            <p className="text-muted-foreground text-sm">
              <CardText
                text={card.errata?.correctedRulesText ?? printing.printedRulesText}
                onKeywordClick={onKeywordClick}
                interactive={interactive}
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

        {hasEffect && (
          <div
            className="border-border/50 rounded-lg border px-3 py-2.5"
            style={getDomainGradientStyle(card.domains, "18", domainColors)}
          >
            {printing.printedEffectText && (
              <p className="text-muted-foreground text-sm">
                <CardText
                  text={card.errata?.correctedEffectText ?? printing.printedEffectText}
                  onKeywordClick={onKeywordClick}
                  interactive={interactive}
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

        {hasFlavor && <CardDetailFlavorText printing={printing} />}
      </div>
      <OrnamentBase surfaceClassName="bg-muted/30" aria-hidden={false}>
        {rarityIcon && (
          <img
            src={rarityIcon}
            alt={labels.rarities[printing.rarity]}
            title={labels.rarities[printing.rarity]}
            width={28}
            height={28}
            className="size-4"
          />
        )}
      </OrnamentBase>
    </div>
  );
}
