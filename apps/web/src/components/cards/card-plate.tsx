import type { OverlayPlateFields, Printing } from "@openrift/shared";
import { WellKnown, legendDisplayName } from "@openrift/shared";

import { CardDetailStats } from "@/components/cards/card-detail/card-detail-stats";
import {
  CardDetailFlavorText,
  CardDetailText,
} from "@/components/cards/card-detail/card-detail-text";
import { formatPublicCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Whether the plate would carry anything at all for this card.
 *
 * Callers that wrap the plate in their own chrome (the overlay's black plate)
 * ask first, so a card that switches down to nothing leaves no empty box behind.
 *
 * @returns True when at least one switched-on field has something to show.
 */
export function hasCardPlateContent(printing: Printing, fields: OverlayPlateFields): boolean {
  const { card } = printing;
  // Only null means "this card has no such stat" — 0 is a real value (0-cost
  // cards exist) and still counts as content.
  const hasStats = card.energy !== null || card.power !== null || card.might !== null;
  const rulesText = card.errata?.correctedRulesText ?? printing.printedRulesText;
  const effectText = card.errata?.correctedEffectText ?? printing.printedEffectText;

  return Boolean(
    fields.name ||
    fields.code ||
    (fields.stats && hasStats) ||
    (fields.rulesText && (rulesText || effectText)) ||
    (fields.flavorText && printing.flavorText),
  );
}

/**
 * The card's lines written out beside its artwork: name, set code, stats, rules
 * and flavor, each on its own switch.
 *
 * One component for both capture surfaces — the OBS browser source and the
 * presentation stage — so a creator who dresses a card on one recognises it on
 * the other, and a field added here reaches both. It carries no ground of its
 * own: the caller supplies the plate, the panel width and the theme.
 *
 * Errata wins over the printed wording, via {@link CardDetailText}: a stream
 * showing a card's rules should show the rules as they are played, not as they
 * were misprinted.
 *
 * @returns The plate's lines, or null when every switched-on field is empty for
 * this card.
 */
export function CardPlateContent({
  printing,
  fields,
  size,
  interactive = false,
}: {
  printing: Printing;
  fields: OverlayPlateFields;
  /**
   * The title tier, and nothing else: the stage fills a screen and the overlay
   * sits in a corner of one, so only the name needs to differ.
   */
  size: "stage" | "overlay";
  /** Keyword hovers. Off by default — a capture surface has no cursor on it. */
  interactive?: boolean;
}) {
  if (!hasCardPlateContent(printing, fields)) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {fields.name && (
        <div
          className={cn(
            "leading-tight font-semibold text-balance",
            size === "stage" ? "text-3xl" : "text-2xl",
          )}
        >
          {legendDisplayName(printing.card)}
        </div>
      )}
      {fields.code && (
        <div className="text-muted-foreground font-mono text-sm tracking-wide uppercase">
          {formatPublicCode(printing)}
          {printing.finish === WellKnown.finish.FOIL ? " · Foil" : ""}
        </div>
      )}
      {fields.stats && <CardDetailStats printing={printing} align="start" />}
      {fields.rulesText && (
        <CardDetailText printing={printing} showFlavorText={false} interactive={interactive} />
      )}
      {fields.flavorText && <CardDetailFlavorText printing={printing} />}
    </div>
  );
}
