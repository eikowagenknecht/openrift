import type { DeckListItemResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, CheckIcon, CircleAlertIcon, PinIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cardLinkVariants } from "@/components/ui/card-link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useCustomTagList, useDeckFormatList } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatterForMarketplace } from "@/lib/format";
import { resolveFormatTagSummary } from "@/lib/format-tag-config";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { isLocalDeckId } from "@/stores/local-decks-store";

import { DeckActionsMenu } from "./deck-actions-menu";
import { LocalDeckActionsMenu } from "./local-deck-actions-menu";
import { LocalDeckBadge } from "./local-save-hint";

function DomainDot({ domain }: { domain: string }) {
  const domainIcon = getFilterIconPath("domains", domain);
  if (!domainIcon) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <img src={domainIcon} alt={domain} className="size-4" />
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
  const { deck, legendCardId, championCardId, totalCards, isValid, totalValueCents, missingCount } =
    item;
  const isLocal = isLocalDeckId(deck.id);
  const { getPreferredPrinting } = usePreferredPrinting();
  const { labels: formatLabels } = useDeckFormatList();
  const { all: customTags } = useCustomTagList();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);

  const legendCard = legendCardId ? getPreferredPrinting(legendCardId)?.card : undefined;
  const championCard = championCardId ? getPreferredPrinting(championCardId)?.card : undefined;

  const domainColors = useDomainColors();
  const legendDomains = legendCard?.domains;
  const updatedDate = new Date(deck.updatedAt).toISOString().slice(0, 10);

  const tagSummary = resolveFormatTagSummary(deck.format, deck.formatConfig, customTags);
  const identity = [legendCard?.name, championCard?.name].filter(Boolean).join(" / ");
  const subtitle = [identity, tagSummary].filter(Boolean).join(" · ");

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "10", domainColors)
      : undefined;

  return (
    <Link
      to="/decks/$deckId"
      params={{ deckId: deck.id }}
      className={cn(
        cardLinkVariants(),
        // No hover wash here: the domain gradient is an inline style that overrides
        // the wash on legend decks, so drop it everywhere to keep rows consistent.
        "ring-foreground/10 focus-visible:ring-ring/50 group flex items-center gap-3 rounded-lg px-3 py-2 ring-1 outline-none hover:bg-transparent focus-visible:ring-2 data-[archived=true]:opacity-60",
      )}
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
        {missingCount !== null && missingCount > 0 && (
          <span className="text-amber-600 tabular-nums dark:text-amber-500">
            {missingCount} missing
          </span>
        )}
        <span className="tabular-nums">{updatedDate}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isLocal && <LocalDeckBadge className="hidden sm:inline-flex" />}
        {deck.format === WellKnown.deckFormat.FREEFORM ? (
          <Badge variant="outline" className="text-xs">
            {formatLabels[deck.format] ?? deck.format}
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
        {isLocal ? <LocalDeckActionsMenu item={item} /> : <DeckActionsMenu item={item} />}
      </div>
    </Link>
  );
}
