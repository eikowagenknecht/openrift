import type { CardBan, CardType, Rarity } from "@openrift/shared";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardMetaLabelProps {
  shortCode: string;
  name: string;
  type: CardType;
  superTypes: string[];
  rarity: Rarity;
  /** Finish slug — renders a per-finish icon when it's foil/metal/metal-deluxe. */
  finish?: string;
  /** Tooltip title for the finish icon (usually the human-readable finish label). */
  finishTitle?: string;
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
 * Card metadata label — shortcode, name, type + rarity icons.
 * Extracted from CardThumbnail so it can be reused in admin views.
 * @returns The label element.
 */
export function CardMetaLabel({
  shortCode,
  name,
  type,
  superTypes,
  rarity,
  finish,
  finishTitle,
  bans,
  hasRulesDeviation,
  printingComment,
  className,
  price,
}: CardMetaLabelProps) {
  const typeLabel = superTypes.length > 0 ? `${superTypes.join(" ")} ${type}` : type;
  const typeIconPath = getTypeIconPath(type, superTypes);

  return (
    // ⚠ space-y-0.5 and py-0.5 are mirrored as META_LINE_GAP / META_LABEL_PY in card-grid-constants.ts — update both together
    <div className={cn("bg-background space-y-0.5 rounded-md px-1.5 py-0.5", className)}>
      {/* ⚠ text-xs is mirrored as META_LINE_HEIGHT in card-grid-constants.ts — update both together */}
      {/* min-h-4: WebKit computes block height from font metrics instead of line-height */}
      {/* when overflow:hidden is set (via truncate), causing 1px shorter elements on iOS Safari. */}
      {/* See https://bugs.webkit.org/show_bug.cgi?id=225695 */}
      <div className="text-muted-foreground flex min-h-4 items-center justify-between gap-1 text-xs">
        <span className="truncate font-medium">{shortCode}</span>
        <span className="flex shrink-0 items-center gap-1">
          {typeIconPath && (
            <img
              src={typeIconPath}
              alt={typeLabel}
              title={typeLabel}
              className="size-3.5 brightness-0 dark:invert"
            />
          )}
          <img
            src={`/images/rarities/${rarity.toLowerCase()}-28x28.webp`}
            alt={rarity}
            title={rarity}
            width={28}
            height={28}
            className="size-3.5"
          />
          {finish && <FinishIcon finish={finish} title={finishTitle} />}
          {bans && bans.length > 0 && (
            <Tooltip>
              <TooltipTrigger className="cursor-default">
                <TriangleAlertIcon className="size-3.5 text-red-500" />
              </TooltipTrigger>
              <TooltipContent className="flex-col items-start">
                {bans.map((ban) => (
                  <div key={ban.formatId}>
                    <div>
                      Banned in {ban.formatName} since {ban.bannedAt}
                    </div>
                    {ban.reason && <div className="opacity-80">{ban.reason}</div>}
                  </div>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
          {hasRulesDeviation && (
            <Tooltip>
              <TooltipTrigger className="cursor-default">
                <TriangleAlertIcon className="size-3.5 text-yellow-500" />
              </TooltipTrigger>
              <TooltipContent>Printed text differs from current rules</TooltipContent>
            </Tooltip>
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
