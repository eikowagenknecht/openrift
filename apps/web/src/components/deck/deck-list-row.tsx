import type { DeckListItemResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, CheckIcon, CircleAlertIcon, PinIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

import { DeckActionsMenu } from "./deck-actions-menu";

function DomainDot({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  const ext = domain === WellKnown.domain.COLORLESS ? "svg" : "webp";
  return (
    <Tooltip>
      <TooltipTrigger>
        <img src={`/images/domains/${lower}.${ext}`} alt={domain} className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{domain}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Compact one-row deck list entry — denser alternative to the tile grid.
 * @returns A deck list row.
 */
export function DeckListRow({ item }: { item: DeckListItemResponse }) {
  const { deck, legendCardId, championCardId, totalCards, isValid, totalValueCents } = item;
  const { getPreferredPrinting } = usePreferredPrinting();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);

  const legendCard = legendCardId ? getPreferredPrinting(legendCardId)?.card : undefined;
  const championCard = championCardId ? getPreferredPrinting(championCardId)?.card : undefined;

  const domainColors = useDomainColors();
  const legendDomains = legendCard?.domains;
  const updatedDate = new Date(deck.updatedAt).toISOString().slice(0, 10);

  const subtitle = [legendCard?.name, championCard?.name].filter(Boolean).join(" / ");

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "10", domainColors)
      : undefined;

  return (
    <Link
      to="/decks/$deckId"
      params={{ deckId: deck.id }}
      className="hover:ring-ring/40 hover:bg-muted/30 group flex items-center gap-3 rounded-lg border px-3 py-2 transition-shadow hover:ring-2 data-[archived=true]:opacity-60"
      data-archived={deck.archivedAt !== null}
      style={gradientStyle}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex shrink-0 items-center gap-0.5">
          {legendDomains?.map((domain) => (
            <DomainDot key={domain} domain={domain} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {deck.isPinned && (
              <PinIcon className="text-muted-foreground size-3.5 shrink-0" aria-label="Pinned" />
            )}
            {deck.archivedAt !== null && (
              <ArchiveIcon
                className="text-muted-foreground size-3.5 shrink-0"
                aria-label="Archived"
              />
            )}
            <span className="truncate font-medium">{deck.name}</span>
          </div>
          {subtitle && <div className="text-muted-foreground truncate text-xs">{subtitle}</div>}
        </div>
      </div>

      <div className="text-muted-foreground hidden items-center gap-3 text-xs sm:flex">
        <span className="tabular-nums">{totalCards} cards</span>
        {totalValueCents !== null && totalValueCents > 0 && (
          <span className="tabular-nums">
            {formatterForMarketplace(marketplaceOrder[0] ?? "cardtrader")(totalValueCents / 100)}
          </span>
        )}
        <span className="tabular-nums">{updatedDate}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {deck.format === "freeform" ? (
          <Badge variant="outline" className="text-xs">
            Freeform
          </Badge>
        ) : isValid ? (
          <Badge
            variant="outline"
            className="border-green-600/30 bg-green-600/10 text-xs text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
          >
            <CheckIcon className="size-3" />
            Valid
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-amber-600/30 bg-amber-600/10 text-xs text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
          >
            <CircleAlertIcon className="size-3" />
            Invalid
          </Badge>
        )}
        <DeckActionsMenu item={item} />
      </div>
    </Link>
  );
}
