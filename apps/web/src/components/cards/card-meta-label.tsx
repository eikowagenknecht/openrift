import type { CardBan } from "@openrift/shared/types/catalog";
import type { Rarity } from "@openrift/shared/types/enums";
import { LOW_RARITIES, WellKnown } from "@openrift/shared/well-known";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardMetaLabelProps {
  shortCode: string;
  name: string;
  rarity: Rarity;
  rarityTitle?: string;
  finish?: string;
  finishTitle?: string;
  oversized?: boolean;
  sizeLabel?: string;
  bans?: CardBan[];
  hasRulesDeviation?: boolean;
  printingComment?: string | null;
  className?: string;
  price?: ReactNode;
}

export function CardMetaLabel({
  shortCode,
  name,
  rarity,
  rarityTitle,
  finish,
  finishTitle,
  oversized,
  sizeLabel,
  bans,
  hasRulesDeviation,
  printingComment,
  className,
  price,
}: CardMetaLabelProps) {
  const rarityIconPath = getFilterIconPath("rarities", rarity);
  const showFinishIcon =
    finish !== undefined && (finish !== WellKnown.finish.FOIL || LOW_RARITIES.has(rarity));

  return (
    // ⚠ space-y-0.5 and py-0.5 are mirrored as META_LINE_GAP / META_LABEL_PY in card-grid-constants.ts — update both together
    // @container lets the price node collapse a min–max range to its "from"
    // price on narrow cells (see priceNode in card-thumbnail.tsx).
    <div className={cn("bg-background @container space-y-0.5 rounded-md px-1.5 py-0.5", className)}>
      {/* ⚠ text-xs is mirrored as META_LINE_HEIGHT in card-grid-constants.ts — update both together */}
      {/* min-h-4: WebKit truncate + overflow:hidden shortens by 1px on iOS Safari, see webkit.org/b/225695 */}
      <div className="text-muted-foreground flex min-h-4 items-center justify-between gap-1 text-xs">
        <span className="truncate font-medium">{shortCode}</span>
        <span className="flex shrink-0 items-center gap-1">
          {rarityIconPath && (
            <img
              src={rarityIconPath}
              alt={rarityTitle ?? rarity}
              title={rarityTitle ?? rarity}
              width={28}
              height={28}
              className="size-3.5"
            />
          )}
          {showFinishIcon && finish && <FinishIcon finish={finish} title={finishTitle} />}
          {oversized && (
            <span
              title={sizeLabel}
              className="bg-muted text-muted-foreground text-2xs rounded-md px-1 leading-tight font-semibold tracking-wide uppercase"
            >
              {sizeLabel}
            </span>
          )}
          {bans && bans.length > 0 && (
            <span
              title={bans
                .map((ban) => `Banned in ${ban.formatName} since ${ban.bannedAt}`)
                .join("\n")}
              className="inline-flex"
            >
              <TriangleAlertIcon className="text-destructive size-3.5" />
            </span>
          )}
          {hasRulesDeviation && (
            <span title="Printed text differs from current rules" className="inline-flex">
              <TriangleAlertIcon className="text-warning size-3.5" />
            </span>
          )}
          {printingComment && (
            <Tooltip>
              <TooltipTrigger className="cursor-default" aria-label="Printing note">
                <InfoIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{printingComment}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
      {/* min-h-4: same WebKit workaround as above */}
      <div className="flex min-h-4 items-center gap-1 text-xs font-medium">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {price}
      </div>
    </div>
  );
}
