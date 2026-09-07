import type { DeckListItemResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, PinIcon } from "lucide-react";

import { cardLinkVariants } from "@/components/ui/card-link";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useCustomTagList } from "@/hooks/use-enums";
import { useHomeCollection } from "@/hooks/use-home-collection";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckFamilyEntry } from "@/lib/deck-family";
import { deckBoxPart } from "@/lib/deck-meta";
import { getDomainGradientStyle } from "@/lib/domain";
import { resolveFormatTagSummary } from "@/lib/format-tag-config";
import { isLocalDeckId } from "@/lib/local-deck";
import { cn } from "@/lib/utils";

import { DeckActionsMenu } from "./deck-actions-menu";
import { DeckFolderChips } from "./deck-folder-chips";
import { DeckFormatText } from "./deck-format-badge";
import { DeckIdentityLine } from "./deck-identity-line";
import { DeckMetaLine } from "./deck-meta-line";
import { DraftBadge, VariantCountToggle } from "./deck-variant-controls";
import { DomainIcon } from "./domain-icon";
import { LocalDeckActionsMenu } from "./local-deck-actions-menu";
import { LocalDeckBadge } from "./local-save-hint";

export function DeckListRow({
  item,
  folderLabels = {},
  family,
  onToggleFamily,
}: {
  item: DeckListItemResponse;
  folderLabels?: Record<string, string>;
  /** Absent for a standalone deck. */
  family?: DeckFamilyEntry;
  onToggleFamily?: (familyId: string) => void;
}) {
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
  const box = useHomeCollection(deck.collectionId);
  const boxPart = deckBoxPart(box?.name);

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "10", domainColors)
      : undefined;

  // Built before the return so the narrowing survives into the JSX.
  const variantToggle =
    family && onToggleFamily && family.role === "front" && family.memberCount > 1 ? (
      <VariantCountToggle family={family} onToggle={onToggleFamily} />
    ) : null;

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
    <div
      className={cn(
        cardLinkVariants(),
        // Domain gradient is an inline style that overrides the hover wash on
        // legend decks, so drop the wash everywhere to keep rows consistent.
        "ring-border group relative flex items-center gap-3 rounded-lg px-3 py-2 ring-1 hover:bg-transparent data-[archived=true]:opacity-60",
        // Stretched-link: the deck name is the row's only anchor (an anchor
        // can't contain the menu and badges), so the focus ring follows it.
        "has-[a:focus-visible]:ring-ring/50 has-[a:focus-visible]:ring-2",
        // Anything reacting to hover must sit above the stretched-link overlay
        // (tooltip triggers, native titles) or it never sees the hover.
        "**:data-[slot=tooltip-trigger]:relative **:data-[slot=tooltip-trigger]:z-10",
        "[&_[title]]:relative [&_[title]]:z-10",
        // Indent is the only thing marking a revealed sibling as one.
        family?.role === "member" && "ml-4 sm:ml-8",
      )}
      data-archived={deck.archivedAt !== null}
      style={gradientStyle}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex shrink-0 items-center gap-0.5">
          {legendDomains?.map((domain) => (
            <DomainIcon key={domain} domain={domain} className="size-4" />
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
            {/* The ::after is what makes the whole row clickable. It resolves
                against the row root, the only positioned ancestor. */}
            <Link
              to="/decks/$deckId"
              params={{ deckId: deck.id }}
              className="truncate rounded-lg font-medium outline-none after:absolute after:inset-0"
            >
              {deck.name}
            </Link>
            {deck.isDraft && <DraftBadge />}
            {variantToggle}
          </div>
          <DeckIdentityLine
            legendCard={legendCard}
            championCard={championCard}
            tagSummary={tagSummary}
          />
          {/* Below md there's no width for both columns and a readable name. */}
          <DeckMetaLine item={item} leading={formatText} className="mt-0.5 md:hidden" />
        </div>
      </div>

      {/* Folders sit alongside the box, on the same md+ tier: below that the row
          is already fighting for the deck name's width. */}
      <DeckFolderChips
        folderIds={item.folderIds}
        folderLabels={folderLabels}
        className="hidden shrink-0 flex-nowrap md:flex"
      />

      {/* The box sits between the name and the stat columns, sized to its own
          text: as free text it would only truncate in a fixed column, and the
          name block's flex-1 pushes it up against the columns anyway. */}
      {boxPart.text && (
        <span
          title={boxPart.title}
          className="text-muted-foreground hidden min-w-0 truncate text-xs md:block"
        >
          {boxPart.text}
        </span>
      )}

      {/* The format rides in the stat cluster as text, not as a badge: a chip
          here is shrink-0 chrome that costs the deck name its width. */}
      <DeckMetaLine
        item={item}
        variant="columns"
        leading={formatText}
        className="hidden shrink-0 md:flex"
      />

      {/* Above the stretched link, so the menu takes its own clicks. */}
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {isLocal && <LocalDeckBadge className="hidden md:inline-flex" />}
        {isLocal ? <LocalDeckActionsMenu item={item} /> : <DeckActionsMenu item={item} />}
      </div>
    </div>
  );
}
