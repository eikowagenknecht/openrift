import type { OverlayPlateFields, Printing } from "@openrift/shared";
import { WellKnown, legendDisplayName } from "@openrift/shared";

import { CardDetailStats } from "@/components/cards/card-detail/card-detail-stats";
import {
  CardDetailFlavorText,
  CardDetailText,
} from "@/components/cards/card-detail/card-detail-text";
import { formatPublicCode } from "@/lib/format";
import { cn } from "@/lib/utils";

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

// Shared by the OBS overlay and the presentation stage, so a field added
// here reaches both; errata wins over printed wording via CardDetailText.
export function CardPlateContent({
  printing,
  fields,
  size,
  interactive = false,
}: {
  printing: Printing;
  fields: OverlayPlateFields;
  size: "stage" | "overlay";
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
