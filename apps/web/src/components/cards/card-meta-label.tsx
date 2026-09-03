import type { CardBan, Rarity } from "@openrift/shared";
import { LOW_RARITIES, WellKnown } from "@openrift/shared";
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
  /** Tooltip title for the rarity icon (the human-readable rarity label). */
  rarityTitle?: string;
  /**
   * Finish slug — renders a per-finish icon when it's foil/metal/metal-deluxe.
   * The foil icon is suppressed at always-foil rarities (everything above
   * uncommon), where foil is the plain version and the icon would be noise.
   */
  finish?: string;
  /** Tooltip title for the finish icon (usually the human-readable finish label). */
  finishTitle?: string;
  /** True when the printing is an oversized variety; renders a small size chip. */
  oversized?: boolean;
  /** Human-readable size label shown in the chip (e.g. "Oversized"). */
  sizeLabel?: string;
  /** Ban records to show as a warning icon with tooltip. */
  bans?: CardBan[];
  /** True when printed rules text differs from the card's current rules text. */
  hasRulesDeviation?: boolean;
  /** Editor note about this specific printing. Rendered as an info icon with tooltip. */
  printingComment?: string | null;
  className?: string;
  /** Optional price element rendered right-aligned on the name line. */
  price?: ReactNode;
}

/**
 * Card metadata label — shortcode, name, rarity icon and printing flags.
 * @returns The label element.
 */
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
      {/* min-h-4: WebKit computes block height from font metrics instead of line-height */}
      {/* when overflow:hidden is set (via truncate), causing 1px shorter elements on iOS Safari. */}
      {/* See https://bugs.webkit.org/show_bug.cgi?id=225695 */}
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
