import type { Printing } from "@openrift/shared/types/catalog";
import type { GroupByField } from "@openrift/shared/types/search";
import { HeartIcon, LibraryBigIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { BrowserToolbar } from "@/features/cards/components/card-browser-filter-scaffold";
import { defaultGroupByOptions } from "@/features/cards/components/options-bar";
import { GROUP_BY_LABELS } from "@/features/cards/lib/group-by-field";
import type { StackedEntry } from "@/features/collections/lib/stacked-entry";

interface CollectionGridToolbarProps {
  sortedCards: Printing[];
  stackByPrintingId: Map<string, StackedEntry>;
  view: "cards" | "printings" | "copies";
  dataView: "cards" | "printings";
  hasActiveFilters: boolean;
  totalCopies: number;
  totalUniqueCards: number;
  showLibrary: boolean;
  collectionGroupingAvailable: boolean;
  groupBy: GroupByField;
  isGroupCollection: boolean;
  wantedOnly: boolean;
  onWantedOnlyChange?: (next: boolean) => void;
  addTarget: string | undefined;
  onToggleLibrary: () => void;
}

export function CollectionGridToolbar({
  sortedCards,
  stackByPrintingId,
  view,
  dataView,
  hasActiveFilters,
  totalCopies,
  totalUniqueCards,
  showLibrary,
  collectionGroupingAvailable,
  groupBy,
  isGroupCollection,
  wantedOnly,
  onWantedOnlyChange,
  addTarget,
  onToggleLibrary,
}: CollectionGridToolbarProps) {
  const wantedButton =
    isGroupCollection && onWantedOnlyChange ? (
      <Toggle
        variant="outline"
        pressed={wantedOnly}
        onPressedChange={onWantedOnlyChange}
        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground"
        title={wantedOnly ? "Show everything in the box" : "Show only cards you want"}
        aria-label={wantedOnly ? "Show everything in the box" : "Show only cards you want"}
      >
        <HeartIcon className="size-4" />
        <span className="hidden sm:inline">Wanted</span>
      </Toggle>
    ) : null;

  const showLibraryButton = addTarget ? (
    <Button
      variant={showLibrary ? "default" : "outline"}
      size="icon"
      onClick={onToggleLibrary}
      title={showLibrary ? "Hide library" : "Show whole library"}
      aria-label={showLibrary ? "Hide library" : "Show whole library"}
      aria-pressed={showLibrary}
    >
      <LibraryBigIcon className="size-4" />
    </Button>
  ) : null;

  // In cards+set / cards+rarity, a card splits into one tile per section, so
  // sortedCards over-counts; count distinct cardIds instead.
  const filteredCardCount =
    dataView === "cards"
      ? new Set(sortedCards.map((card) => card.cardId)).size
      : sortedCards.length;

  return (
    <BrowserToolbar
      totalCards={view === "copies" ? totalCopies : totalUniqueCards}
      filteredCount={
        view === "copies"
          ? sortedCards.reduce(
              (sum, card) => sum + (stackByPrintingId.get(card.id)?.copyIds.length ?? 0),
              0,
            )
          : filteredCardCount
      }
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredCardCount} ${dataView === "cards" ? "cards" : "printings"}`
          : undefined
      }
      extras={
        <>
          {wantedButton}
          {showLibraryButton}
        </>
      }
      showCopies={!showLibrary}
      groupByOptions={
        collectionGroupingAvailable
          ? [...defaultGroupByOptions, { value: "collection", label: GROUP_BY_LABELS.collection }]
          : undefined
      }
      groupByValue={groupBy}
    />
  );
}
