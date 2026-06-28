import type { CollectionResponse, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, InboxIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useEnumOrders } from "@/hooks/use-enums";
import { useOwnedCollectionsByVariants } from "@/hooks/use-owned-count";
import { useRequiredUserId } from "@/lib/auth-session";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";

interface VariantLocationsPopoverProps {
  /** All variants (sibling printings) of the card, in display order. */
  printings: Printing[];
  /** Initial keyboard highlight target (e.g. the printing selected on the grid). */
  initialHighlightId?: string;
  /**
   * How the popover was opened. `remove` lands the highlight on a collection
   * row so `-` / Enter removes; `add` lands on the variant header so `+` / Enter
   * quick-adds. `+` / `=` / `-` are always literal regardless of intent.
   */
  intent: VariantPopoverIntent;
  /** Quick-add a variant to the default target (current collection, or inbox on All Cards). */
  onQuickAdd: (printing: Printing) => void;
  /** Add a copy of a variant to a specific collection. */
  onAddToCollection: (printing: Printing, collectionId: string) => void;
  /** Remove the newest copy of a variant from a specific collection. */
  onRemoveFromCollection: (printing: Printing, collectionId: string) => void;
  /**
   * The variant whose "add to another collection" sub-page is open, or null for
   * the main page. Lifted to the host so its ESC handler can step back to the
   * main page instead of closing the popover. Implemented as a children/header
   * swap inside the same PickerList so cmdk's Command stays mounted (re-mounting
   * it would lose keyboard focus to BaseUI's FloatingFocusManager).
   */
  addCollectionTarget: Printing | null;
  setAddCollectionTarget: (printing: Printing | null) => void;
}

type RowAction =
  | { kind: "variant"; printing: Printing }
  | { kind: "location"; printing: Printing; collectionId: string }
  | { kind: "add"; printing: Printing };

/** Per-collection owned counts for one variant, as returned by useOwnedCollectionsByVariants. */
interface VariantBreakdownEntry {
  printingId: string;
  collections: { collectionId: string; collectionName: string; count: number }[];
}

/**
 * One variant×collection breakdown row group, used to render the main page and
 * to resolve a highlighted row id back to its action.
 */
export interface VariantGroup {
  printing: Printing;
  total: number;
  locations: { collectionId: string; collectionName: string; count: number }[];
  /** Personal collections the variant is not yet in, offered on the add sub-page. */
  addCandidates: CollectionResponse[];
}

/**
 * Builds one row group per variant: its owned total, the collections it lives in
 * (ordered by the canonical personal-collection order so rows don't jitter as
 * copies change), and the personal collections it is not yet in (the add-page
 * candidates). Variants with no owned copies still get a group (total 0, no
 * locations) so the unowned/add path renders.
 * @returns One {@link VariantGroup} per printing, in input order.
 */
export function buildVariantGroups(
  printings: readonly Printing[],
  breakdown: readonly VariantBreakdownEntry[] | undefined,
  personalCollections: readonly CollectionResponse[],
): VariantGroup[] {
  const collectionIndex = new Map(
    personalCollections.map((collection, index) => [collection.id, index]),
  );
  const breakdownByPrinting = new Map((breakdown ?? []).map((entry) => [entry.printingId, entry]));

  return printings.map((printing) => {
    const entry = breakdownByPrinting.get(printing.id);
    const locations = [...(entry?.collections ?? [])].sort(
      (left, right) =>
        (collectionIndex.get(left.collectionId) ?? Number.MAX_SAFE_INTEGER) -
        (collectionIndex.get(right.collectionId) ?? Number.MAX_SAFE_INTEGER),
    );
    const ownedCollectionIds = new Set(locations.map((location) => location.collectionId));
    return {
      printing,
      total: locations.reduce((sum, location) => sum + location.count, 0),
      locations,
      addCandidates: personalCollections.filter(
        (collection) => !ownedCollectionIds.has(collection.id),
      ),
    };
  });
}

/**
 * Unified variant×collection popover for collection browse mode. Each variant
 * is a section: a header with its owned total and a quick-add `+` (to the
 * default target), per-collection rows with `-`/`+`, and an "add to another
 * collection" row that swaps to a collection picker sub-page. Replaces the
 * former separate variant-add, owned-locations, and dispose pickers.
 * @returns A keyboard-navigable PickerList for the popover body.
 */
export function VariantLocationsPopover({
  printings,
  initialHighlightId,
  intent,
  onQuickAdd,
  onAddToCollection,
  onRemoveFromCollection,
  addCollectionTarget,
  setAddCollectionTarget,
}: VariantLocationsPopoverProps) {
  const { labels } = useEnumOrders();
  const userId = useRequiredUserId();
  const { data: collections } = useQuery(collectionsQueryOptions(userId));
  const { data: breakdown } = useOwnedCollectionsByVariants(printings, true);

  const hasMixedRarities = new Set(printings.map((printing) => printing.rarity)).size > 1;

  // Adding copies always targets a personal collection (group copies belong to
  // the group), so the breakdown and add-candidate lists are personal-only.
  const personalCollections = (collections ?? []).filter(
    (collection) => collection.groupId === null,
  );
  const groups = buildVariantGroups(printings, breakdown, personalCollections);

  // Resolve a highlighted row id back to the action it performs. Built from the
  // same row values rendered below so we never parse composite ids by hand.
  const actionByValue = new Map<string, RowAction>();
  for (const group of groups) {
    actionByValue.set(variantRowValue(group.printing), {
      kind: "variant",
      printing: group.printing,
    });
    for (const location of group.locations) {
      actionByValue.set(locationRowValue(group.printing, location.collectionId), {
        kind: "location",
        printing: group.printing,
        collectionId: location.collectionId,
      });
    }
    actionByValue.set(addRowValue(group.printing), { kind: "add", printing: group.printing });
  }

  const isAddPage = addCollectionTarget !== null;
  const addGroup = addCollectionTarget
    ? groups.find((group) => group.printing.id === addCollectionTarget.id)
    : undefined;

  // Initial highlight: a collection row for `remove` (so `-` acts immediately),
  // the variant header for `add`. Falls back to the first available row.
  const preferredPrinting =
    groups.find((group) => group.printing.id === initialHighlightId)?.printing ?? printings[0];
  const preferredGroup = groups.find((group) => group.printing.id === preferredPrinting?.id);
  const initialId =
    intent === "remove" && preferredGroup?.locations[0]
      ? locationRowValue(preferredPrinting, preferredGroup.locations[0].collectionId)
      : preferredPrinting
        ? variantRowValue(preferredPrinting)
        : "";

  // Two highlight states (main vs. add sub-page) so the value passed to cmdk is
  // already correct at the moment each set of rows registers — cmdk only
  // auto-selects the first row when its value is falsy AT REGISTRATION TIME.
  const [mainHighlightedId, setMainHighlightedId] = useState(initialId);
  const [addHighlightedId, setAddHighlightedId] = useState("");
  const highlightedId = isAddPage ? addHighlightedId : mainHighlightedId;
  const setHighlightedId = isAddPage ? setAddHighlightedId : setMainHighlightedId;

  // Reset the sub-page highlight after leaving it so the next visit lands on the
  // first candidate rather than the previously-picked collection.
  useEffect(() => {
    if (!isAddPage) {
      setAddHighlightedId("");
    }
  }, [isAddPage]);

  if (isAddPage && addGroup) {
    return (
      <PickerList
        highlightedId={highlightedId}
        onHighlightChange={setHighlightedId}
        header={
          <div className="px-2.5 pt-2 pb-0.5">
            <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
              Add to collection
            </p>
          </div>
        }
      >
        {addGroup.addCandidates.map((collection) => (
          <PickerRow
            key={collection.id}
            value={collection.id}
            onSelect={() => {
              onAddToCollection(addGroup.printing, collection.id);
              setAddCollectionTarget(null);
            }}
          >
            {collection.isInbox ? (
              <InboxIcon className="size-3.5 shrink-0" />
            ) : (
              <BookOpenIcon className="size-3.5 shrink-0" />
            )}
            <span className="flex-1">{collection.name}</span>
          </PickerRow>
        ))}
        {addGroup.addCandidates.length === 0 && (
          <p className="text-muted-foreground px-3 py-2 text-sm">
            Already in all your collections.
          </p>
        )}
      </PickerList>
    );
  }

  return (
    <PickerList
      highlightedId={highlightedId}
      onHighlightChange={setHighlightedId}
      onKeyDown={(event, id) => {
        const action = actionByValue.get(id);
        if (!action) {
          return;
        }
        // `=` is a no-shift alias for `+` (US layouts need Shift+=). Enter
        // follows the entry intent; Shift+Enter is the inverse.
        const enterAdds =
          event.key === "Enter" && (intent === "add" ? !event.shiftKey : event.shiftKey);
        const enterRemoves =
          event.key === "Enter" && (intent === "remove" ? !event.shiftKey : event.shiftKey);
        const isIncrement = event.key === "+" || event.key === "=" || enterAdds;
        const isDecrement = event.key === "-" || enterRemoves;

        if (action.kind === "add") {
          if (event.key === "Enter") {
            event.preventDefault();
            setAddCollectionTarget(action.printing);
          }
          return;
        }
        if (isIncrement) {
          event.preventDefault();
          if (action.kind === "variant") {
            onQuickAdd(action.printing);
          } else {
            onAddToCollection(action.printing, action.collectionId);
          }
          return;
        }
        if (isDecrement && action.kind === "location") {
          event.preventDefault();
          onRemoveFromCollection(action.printing, action.collectionId);
        }
      }}
    >
      {groups.map((group, groupIndex) => {
        const rarityIcon = getFilterIconPath("rarities", group.printing.rarity);
        return (
          <Fragment key={group.printing.id}>
            {/* Each variant heads its own section: a subtle filled band at rest sets it apart
                from its child rows; the gold data-selected highlight still overrides it on focus. */}
            <PickerRow
              value={variantRowValue(group.printing)}
              className={cn("bg-muted/50 py-0.5", groupIndex > 0 && "mt-1.5")}
            >
              <div className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
                {hasMixedRarities && rarityIcon && (
                  <img
                    src={rarityIcon}
                    alt={group.printing.rarity}
                    title={group.printing.rarity}
                    width={28}
                    height={28}
                    className="size-3.5 shrink-0"
                  />
                )}
                <span className="text-muted-foreground text-2xs shrink-0">
                  {formatCardId(group.printing)}
                </span>
                <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
                  {formatPrintingLabel(group.printing, printings, labels) || group.printing.setSlug}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {/* Spacer reserves the child rows' minus-button column so the total and the +
                    button land in the same grid as every child row's [- count +] cluster. */}
                <span aria-hidden className="size-6 shrink-0" />
                <span className="text-muted-foreground w-5 text-center font-medium tabular-nums">
                  {group.total}
                </span>
                <Button
                  type="button"
                  tabIndex={-1}
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onQuickAdd(group.printing)}
                  aria-label={`Add ${legendDisplayName(group.printing.card)}`}
                >
                  <PlusIcon />
                </Button>
              </div>
            </PickerRow>
            {group.locations.map((location) => (
              <PickerRow
                key={location.collectionId}
                value={locationRowValue(group.printing, location.collectionId)}
                className="py-0.5 pl-4"
              >
                <span className="flex-1 truncate">{location.collectionName}</span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    tabIndex={-1}
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => onRemoveFromCollection(group.printing, location.collectionId)}
                    aria-label={`Remove ${legendDisplayName(group.printing.card)} from ${location.collectionName}`}
                  >
                    <MinusIcon />
                  </Button>
                  <span className="text-muted-foreground w-5 text-center tabular-nums">
                    {location.count}
                  </span>
                  <Button
                    type="button"
                    tabIndex={-1}
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => onAddToCollection(group.printing, location.collectionId)}
                    aria-label={`Add ${legendDisplayName(group.printing.card)} to ${location.collectionName}`}
                  >
                    <PlusIcon />
                  </Button>
                </div>
              </PickerRow>
            ))}
            <PickerRow
              value={addRowValue(group.printing)}
              className="text-muted-foreground py-0.5 pl-4"
              onSelect={() => setAddCollectionTarget(group.printing)}
            >
              <PlusIcon className="size-3.5 shrink-0" />
              <span className="flex-1">Add to another collection</span>
            </PickerRow>
          </Fragment>
        );
      })}
    </PickerList>
  );
}

// Row id helpers — opaque values cmdk round-trips back through onKeyDown; we
// resolve them via actionByValue rather than parsing.
function variantRowValue(printing: Printing): string {
  return `variant::${printing.id}`;
}

function locationRowValue(printing: Printing, collectionId: string): string {
  return `location::${printing.id}::${collectionId}`;
}

function addRowValue(printing: Printing): string {
  return `add::${printing.id}`;
}
