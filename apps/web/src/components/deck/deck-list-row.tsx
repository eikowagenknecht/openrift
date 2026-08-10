import type { DeckListItemResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, PinIcon } from "lucide-react";

import { cardLinkVariants } from "@/components/ui/card-link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useCustomTagList } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { getDomainGradientStyle } from "@/lib/domain";
import { resolveFormatTagSummary } from "@/lib/format-tag-config";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { isLocalDeckId } from "@/stores/local-decks-store";

import { DeckActionsMenu } from "./deck-actions-menu";
import { DeckBoxMarker } from "./deck-box-marker";
import { DeckFormatText } from "./deck-format-badge";
import { DeckIdentityLine } from "./deck-identity-line";
import { DeckMetaLine } from "./deck-meta-line";
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
  const {
    deck,
    legendCardId,
    championCardId,
    isValid,
    totalCards,
    requiredProgress,
    requiredTotal,
  } = item;
  const isLocal = isLocalDeckId(deck.id);
  const { getPreferredPrinting } = usePreferredPrinting();
  const { all: customTags } = useCustomTagList();

  const legendCard = legendCardId ? getPreferredPrinting(legendCardId)?.card : undefined;
  const championCard = championCardId ? getPreferredPrinting(championCardId)?.card : undefined;

  const domainColors = useDomainColors();
  const legendDomains = legendCard?.domains;

  const tagSummary = resolveFormatTagSummary(deck.format, deck.formatConfig, customTags);

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "10", domainColors)
      : undefined;

  // One element for both renderings, so the phone line and the columns can't
  // disagree about the deck's state.
  const formatText = (
    <DeckFormatText
      format={deck.format}
      totalCards={totalCards}
      requiredProgress={requiredProgress}
      requiredTotal={requiredTotal}
      isValid={isValid}
    />
  );

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
          {/* The box shares the subtitle line rather than taking one of its
              own: the row is one line tall on desktop and the identity text
              yields width before the box name does. */}
          <div className="flex min-w-0 items-baseline gap-2">
            <DeckIdentityLine
              legendCard={legendCard}
              championCard={championCard}
              tagSummary={tagSummary}
              className="min-w-0"
            />
            <DeckBoxMarker collectionId={deck.collectionId} className="max-w-32 shrink-0" />
          </div>
          {/* Below md there isn't width for both the columns and a readable
              name, so the same facts wrap under the name instead — which is
              also what stops phones losing them entirely, as they used to. */}
          <DeckMetaLine item={item} leading={formatText} className="mt-0.5 md:hidden" />
        </div>
      </div>

      {/* The format rides in the stat cluster as text, not as a badge: a chip
          here is shrink-0 chrome that costs the deck name its width. */}
      <DeckMetaLine
        item={item}
        variant="columns"
        leading={formatText}
        className="hidden shrink-0 md:flex"
      />

      <div className="flex shrink-0 items-center gap-1">
        {isLocal && <LocalDeckBadge className="hidden md:inline-flex" />}
        {isLocal ? <LocalDeckActionsMenu item={item} /> : <DeckActionsMenu item={item} />}
      </div>
    </Link>
  );
}
