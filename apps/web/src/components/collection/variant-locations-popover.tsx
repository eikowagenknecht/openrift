import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { Fragment, useState } from "react";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Button } from "@/components/ui/button";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useOwnedCollectionsByVariants } from "@/hooks/use-owned-count";
import { useRequiredUserId } from "@/lib/auth-session";
import { formatCardId } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { VariantPopoverIntent } from "@/stores/add-mode-store";

interface VariantLocationsPopoverProps {
  printings: Printing[];
  initialHighlightId?: string;
  intent: VariantPopoverIntent;
  onQuickAdd: (printing: Printing) => void;
  defaultTargetCollectionId?: string;
  onAddToCollection: (printing: Printing, collectionId: string) => void;
  onRemoveFromCollection: (printing: Printing, collectionId: string) => void;
  addCollectionTarget: Printing | null;
  setAddCollectionTarget: (printing: Printing | null) => void;
  viewCollectionId?: string;
}

type RowAction =
  | { kind: "variant"; printing: Printing }
  | { kind: "location"; printing: Printing; collectionId: string }
  | { kind: "add"; printing: Printing };

interface VariantBreakdownEntry {
  printingId: string;
  collections: { collectionId: string; collectionName: string; count: number }[];
}

export interface VariantGroup {
  printing: Printing;
  total: number;
  locations: { collectionId: string; collectionName: string; count: number }[];
  addCandidates: CollectionResponse[];
}

// viewCollectionId sorts first, even though it may be a group collection never
// present in personalCollections, so `remove` intent highlights the opened row.
export function buildVariantGroups(
  printings: readonly Printing[],
  breakdown: readonly VariantBreakdownEntry[] | undefined,
  personalCollections: readonly CollectionResponse[],
  viewCollectionId?: string,
): VariantGroup[] {
  const collectionIndex = new Map(
    personalCollections.map((collection, index) => [collection.id, index]),
  );
  if (viewCollectionId !== undefined) {
    collectionIndex.set(viewCollectionId, -1);
  }
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

export function ownedCountInCollection(group: VariantGroup, collectionId: string): number {
  return group.locations.find((location) => location.collectionId === collectionId)?.count ?? 0;
}

export function VariantLocationsPopover({
  printings,
  initialHighlightId,
  intent,
  onQuickAdd,
  defaultTargetCollectionId,
  onAddToCollection,
  onRemoveFromCollection,
  addCollectionTarget,
  setAddCollectionTarget,
  viewCollectionId,
}: VariantLocationsPopoverProps) {
  const userId = useRequiredUserId();
  const { data: collections } = useQuery(collectionsQueryOptions(userId));
  const { data: breakdown } = useOwnedCollectionsByVariants(printings, true, viewCollectionId);

  const hasMixedRarities = new Set(printings.map((printing) => printing.rarity)).size > 1;

  // Adding copies always targets a personal collection (group copies belong to
  // the group), so the breakdown and add-candidate lists are personal-only.
  const personalCollections = (collections ?? []).filter(
    (collection) => collection.groupId === null,
  );
  const groups = buildVariantGroups(printings, breakdown, personalCollections, viewCollectionId);

  const isRemoveIntent = intent === "remove";
  const visibleGroups = isRemoveIntent ? groups.filter((group) => group.total > 0) : groups;

  const collapsible = !isRemoveIntent && groups.length > 1;

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

  const preferredPrinting =
    groups.find((group) => group.printing.id === initialHighlightId)?.printing ?? printings[0];
  const preferredGroup = groups.find((group) => group.printing.id === preferredPrinting?.id);
  const preferredLocation = preferredGroup?.locations[0];
  const initialId =
    preferredPrinting === undefined
      ? ""
      : intent === "remove" && preferredLocation
        ? locationRowValue(preferredPrinting, preferredLocation.collectionId)
        : variantRowValue(preferredPrinting);

  // cmdk auto-selects the first row only when its value is falsy at
  // registration time, so each page needs its own highlight state ready in advance.
  const [mainHighlightedId, setMainHighlightedId] = useState(initialId);
  const [addHighlightedId, setAddHighlightedId] = useState("");
  const highlightedId = isAddPage ? addHighlightedId : mainHighlightedId;
  const setHighlightedId = isAddPage ? setAddHighlightedId : setMainHighlightedId;

  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(
    () => new Set(preferredPrinting ? [preferredPrinting.id] : []),
  );
  const toggleVariant = (printingId: string) => {
    setExpandedVariants((previous) => {
      const next = new Set(previous);
      if (next.has(printingId)) {
        next.delete(printingId);
      } else {
        next.add(printingId);
      }
      return next;
    });
  };

  const [wasAddPage, setWasAddPage] = useState(isAddPage);
  if (wasAddPage !== isAddPage) {
    setWasAddPage(isAddPage);
    if (!isAddPage) {
      setAddHighlightedId("");
    }
  }

  if (isAddPage && addGroup) {
    return (
      <PickerList
        highlightedId={highlightedId}
        onHighlightChange={setHighlightedId}
        header={
          <div className="px-2.5 pt-2 pb-0.5">
            <SectionHeading as="h3" size="sm">
              Add to collection
            </SectionHeading>
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
        if (action.kind === "add") {
          if (event.key === "Enter") {
            event.preventDefault();
            setAddCollectionTarget(action.printing);
          }
          return;
        }
        // `=` is a no-shift alias for `+` (US layouts need Shift+=).
        if (action.kind === "variant") {
          if (!isRemoveIntent && defaultTargetCollectionId !== undefined && event.key === "-") {
            event.preventDefault();
            onRemoveFromCollection(action.printing, defaultTargetCollectionId);
            return;
          }
          const enterQuickAdds = !collapsible && !isRemoveIntent && event.key === "Enter";
          if (event.key === "+" || event.key === "=" || enterQuickAdds) {
            event.preventDefault();
            onQuickAdd(action.printing);
          }
          return;
        }
        const enterAdds =
          event.key === "Enter" && (intent === "add" ? !event.shiftKey : event.shiftKey);
        const enterRemoves =
          event.key === "Enter" && (intent === "remove" ? !event.shiftKey : event.shiftKey);
        if (event.key === "+" || event.key === "=" || enterAdds) {
          event.preventDefault();
          onAddToCollection(action.printing, action.collectionId);
          return;
        }
        if (event.key === "-" || enterRemoves) {
          event.preventDefault();
          onRemoveFromCollection(action.printing, action.collectionId);
        }
      }}
    >
      {visibleGroups.map((group, groupIndex) => {
        const rarityIcon = getFilterIconPath("rarities", group.printing.rarity);
        const expanded = !collapsible || expandedVariants.has(group.printing.id);
        const onVariantSelect = collapsible ? () => toggleVariant(group.printing.id) : undefined;
        return (
          <Fragment key={group.printing.id}>
            <PickerRow
              value={variantRowValue(group.printing)}
              onSelect={onVariantSelect}
              className={cn(
                "bg-muted/50 py-0.5",
                collapsible && "cursor-pointer",
                groupIndex > 0 && "mt-1.5",
              )}
            >
              <div className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
                {collapsible &&
                  (expanded ? (
                    <ChevronDownIcon className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0" />
                  ))}
                <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
                  <PrintingVariantLabel
                    printing={group.printing}
                    siblings={printings}
                    code={
                      <>
                        {hasMixedRarities && rarityIcon && (
                          <img
                            src={rarityIcon}
                            alt={group.printing.rarity}
                            title={group.printing.rarity}
                            width={28}
                            height={28}
                            className="mr-1 inline size-3.5 align-text-bottom"
                          />
                        )}
                        {formatCardId(group.printing)}
                      </>
                    }
                  />
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {!isRemoveIntent && defaultTargetCollectionId !== undefined ? (
                  <Button
                    type="button"
                    tabIndex={-1}
                    size="icon-xs"
                    variant="ghost"
                    className="transition-none"
                    disabled={ownedCountInCollection(group, defaultTargetCollectionId) === 0}
                    onClick={(event) => {
                      // Don't let the click bubble to the row and toggle the accordion.
                      event.stopPropagation();
                      onRemoveFromCollection(group.printing, defaultTargetCollectionId);
                    }}
                    aria-label={`Remove ${legendDisplayName(group.printing.card)}`}
                  >
                    <MinusIcon />
                  </Button>
                ) : (
                  // Spacer reserves the child rows' minus-button column so the total and the +
                  // button land in the same grid as every child row's [- count +] cluster.
                  <span aria-hidden className="size-6 shrink-0" />
                )}
                <span className="text-muted-foreground w-5 text-center font-medium tabular-nums">
                  {group.total}
                </span>
                {!isRemoveIntent && (
                  <Button
                    type="button"
                    tabIndex={-1}
                    size="icon-xs"
                    variant="ghost"
                    className="transition-none"
                    onClick={(event) => {
                      // Don't let the click bubble to the row and toggle the accordion.
                      event.stopPropagation();
                      onQuickAdd(group.printing);
                    }}
                    aria-label={`Add ${legendDisplayName(group.printing.card)}`}
                  >
                    <PlusIcon />
                  </Button>
                )}
              </div>
            </PickerRow>
            {expanded &&
              group.locations.map((location) => (
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
                      className="transition-none"
                      onClick={() => onRemoveFromCollection(group.printing, location.collectionId)}
                      aria-label={`Remove ${legendDisplayName(group.printing.card)} from ${location.collectionName}`}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="text-muted-foreground w-5 text-center tabular-nums">
                      {location.count}
                    </span>
                    {!isRemoveIntent && (
                      <Button
                        type="button"
                        tabIndex={-1}
                        size="icon-xs"
                        variant="ghost"
                        className="transition-none"
                        onClick={() => onAddToCollection(group.printing, location.collectionId)}
                        aria-label={`Add ${legendDisplayName(group.printing.card)} to ${location.collectionName}`}
                      >
                        <PlusIcon />
                      </Button>
                    )}
                  </div>
                </PickerRow>
              ))}
            {expanded && !isRemoveIntent && (
              <PickerRow
                value={addRowValue(group.printing)}
                className="text-muted-foreground text-2xs py-0.5 pl-4"
                onSelect={() => setAddCollectionTarget(group.printing)}
              >
                <PlusIcon className="size-3 shrink-0" />
                <span className="flex-1">Add to another collection</span>
              </PickerRow>
            )}
          </Fragment>
        );
      })}
    </PickerList>
  );
}

// cmdk round-trips these values back through onKeyDown as opaque strings; resolve via actionByValue, don't parse them.
function variantRowValue(printing: Printing): string {
  return `variant::${printing.id}`;
}

function locationRowValue(printing: Printing, collectionId: string): string {
  return `location::${printing.id}::${collectionId}`;
}

function addRowValue(printing: Printing): string {
  return `add::${printing.id}`;
}
