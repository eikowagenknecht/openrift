import {
  GalleryVerticalEndIcon,
  LayoutGridIcon,
  ListIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

import { DECK_OVERVIEW_SORT_OPTIONS } from "@/components/deck/deck-overview-list";
import { ColumnControls } from "@/components/filters/column-controls";
import {
  activeToggleClass,
  DetailPaneToggle,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckOverviewGroup } from "@/lib/deck-card-group";
import { cn } from "@/lib/utils";
import type { DeckOverviewDisplayMode, DeckOverviewSort } from "@/stores/deck-overview-view-store";
import { useDeckOverviewViewStore } from "@/stores/deck-overview-view-store";

/**
 * How the deck's cards are ordered and split. Built once by the overview and
 * handed to both control clusters, because the Box tab carries the same
 * ordering control as the Deck tab — the box lists the deck in that order.
 */
export interface DeckOrderingControls {
  sortBy: DeckOverviewSort;
  sortDir: "asc" | "desc";
  onSortByChange: (value: DeckOverviewSort) => void;
  onSortDirChange: (value: "asc" | "desc") => void;
  /** The axes on offer — ownership only where the viewer's collection is loaded. */
  groupOptions: SortGroupOption<DeckOverviewGroup>[];
  groupBy: DeckOverviewGroup;
  groupDir: "asc" | "desc";
  onGroupByChange: (value: DeckOverviewGroup) => void;
  onGroupDirChange: (value: "asc" | "desc") => void;
}

/**
 * One boolean display option, rendered as a labelled switch in both the
 * desktop options popover and the phone options drawer.
 */
interface DeckOptionSwitch {
  key: string;
  label: string;
  /** Optional second line, for options whose label doesn't carry the meaning. */
  description?: string;
  checked: boolean;
  /** Whether the option currently sits away from its default. */
  modified: boolean;
  nested?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * One labelled switch in the options popover / drawer.
 * @returns The switch row.
 */
function OptionSwitchRow({
  label,
  description,
  checked,
  nested,
  onCheckedChange,
}: {
  label: string;
  /** Optional second line, for options whose label doesn't carry the meaning. */
  description?: string;
  checked: boolean;
  nested?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Label
      className={cn(
        "justify-between gap-3 leading-normal font-normal",
        nested && "border-border ml-1 border-l pl-3",
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description && <span className="text-muted-foreground text-xs">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </Label>
  );
}

/**
 * The deck's ordering control, in the tab strip's trailing slot.
 * @returns The sort / group control.
 */
export function DeckOrderingControl({
  ordering,
  compact,
}: {
  ordering: DeckOrderingControls;
  /** The phone drawer's inline layout, with no popover of its own. */
  compact?: boolean;
}) {
  const handleSortByChange = ordering.onSortByChange;
  const handleSortDirChange = ordering.onSortDirChange;
  return (
    <SortGroupControls
      compact={compact}
      sortOptions={DECK_OVERVIEW_SORT_OPTIONS}
      sortBy={ordering.sortBy}
      sortDir={ordering.sortDir}
      onSortByChange={handleSortByChange}
      onSortDirChange={handleSortDirChange}
      group={{
        options: ordering.groupOptions,
        value: ordering.groupBy,
        dir: ordering.groupDir,
        onValueChange: ordering.onGroupByChange,
        onDirChange: ordering.onGroupDirChange,
      }}
    />
  );
}

interface DeckOverviewViewControlsProps {
  /** The phone cluster: everything but the display switch moves into a drawer. */
  compact?: boolean;
  displayMode: DeckOverviewDisplayMode;
  ordering: DeckOrderingControls;
  /** The user's column override, or null while the measured Auto is in force. */
  columnOverride: number | null;
  autoColumns: number;
  minColumns: number;
  maxColumnsLimit: number;
  /**
   * The display switches' current values. All of them are hydration-gated by
   * the host, so SSR renders the defaults — keep the gates there, not here.
   */
  showAllCopies: boolean;
  showAllRuneCopies: boolean;
  showBands: boolean;
  showPrices: boolean;
  preferOwned: boolean;
  /** The viewer's collection is loaded, so the printing-swap options apply. */
  canPreferOwned: boolean;
  /** Ownership data is present at all, so prices can be shown. */
  hasOwnershipData: boolean;
}

/**
 * The Deck tab's view controls, in the trailing end of the tab strip: card
 * size, ordering, the grid / stacks / list switch, the display options, and the
 * detail-pane dock toggle.
 *
 * `compact` renders the phone cluster instead — the same controls, with
 * everything but the display switch moved into the options drawer so the tab
 * strip keeps one row.
 *
 * @returns The control cluster.
 */
export function DeckOverviewViewControls({
  compact,
  displayMode,
  ordering,
  columnOverride,
  autoColumns,
  minColumns,
  maxColumnsLimit,
  showAllCopies,
  showAllRuneCopies,
  showBands,
  showPrices,
  preferOwned,
  canPreferOwned,
  hasOwnershipData,
}: DeckOverviewViewControlsProps) {
  const setDisplayMode = useDeckOverviewViewStore((state) => state.setDisplayMode);
  const setColumns = useDeckOverviewViewStore((state) => state.setColumns);
  const setShowAllCopies = useDeckOverviewViewStore((state) => state.setShowAllCopies);
  const setShowAllRuneCopies = useDeckOverviewViewStore((state) => state.setShowAllRuneCopies);
  const setShowOwnershipBands = useDeckOverviewViewStore((state) => state.setShowOwnershipBands);
  const setShowPrices = useDeckOverviewViewStore((state) => state.setShowPrices);
  const setPreferOwnedPrintings = useDeckOverviewViewStore(
    (state) => state.setPreferOwnedPrintings,
  );

  // List mode has no thumbnails, so every option that dresses one drops out.
  const hasThumbnails = displayMode !== "list";

  // The grid / stacks / list switch. Shared by both clusters: it is the one
  // view control that stays on the row on phones, since it changes what the
  // cards look like rather than how they are ordered.
  const displayModeToggle = (
    <ToggleGroup
      variant="outline"
      spacing={0}
      value={[displayMode]}
      onValueChange={([next]) => {
        if (next === "grid" || next === "stacks" || next === "list") {
          setDisplayMode(next);
        }
      }}
      aria-label="Deck view"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem value="grid" className={activeToggleClass} aria-label="Grid view" />
          }
        >
          <LayoutGridIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Grid view</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem
              value="stacks"
              className={activeToggleClass}
              aria-label="Stacks view"
            />
          }
        >
          <GalleryVerticalEndIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Stacks view</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem value="list" className={activeToggleClass} aria-label="List view" />
          }
        >
          <ListIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>List view</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );

  // Every labelled display switch, in one list so the desktop popover and the
  // phone drawer offer the same options in the same order. `modified` drives
  // the dot on the popover trigger: bands default to on, the rest to off.
  const optionSwitches: DeckOptionSwitch[] = [
    ...(hasThumbnails
      ? [
          {
            key: "copies",
            label: "Show every copy",
            description: "One thumbnail per physical copy instead of a ×N badge.",
            checked: showAllCopies,
            modified: showAllCopies,
            onCheckedChange: setShowAllCopies,
          },
        ]
      : []),
    ...(hasThumbnails && showAllCopies
      ? [
          {
            key: "rune-copies",
            label: "Include runes",
            description: "Expand the rune stacks too.",
            checked: showAllRuneCopies,
            modified: showAllRuneCopies,
            nested: true,
            onCheckedChange: setShowAllRuneCopies,
          },
        ]
      : []),
    ...(hasThumbnails && canPreferOwned
      ? [
          {
            key: "bands",
            label: "Highlight owned copies",
            description: "Green: this printing. Blue: another printing.",
            checked: showBands,
            modified: !showBands,
            onCheckedChange: setShowOwnershipBands,
          },
        ]
      : []),
    ...(hasThumbnails && hasOwnershipData
      ? [
          {
            key: "prices",
            label: "Show prices",
            checked: showPrices,
            modified: showPrices,
            onCheckedChange: setShowPrices,
          },
        ]
      : []),
    ...(canPreferOwned
      ? [
          {
            key: "owned-printings",
            label: "Show my printings",
            description: "Swap each card's art for the printing you own.",
            checked: preferOwned,
            modified: preferOwned,
            onCheckedChange: setPreferOwnedPrintings,
          },
        ]
      : []),
  ];

  const optionSwitchRows = optionSwitches.map((option) => (
    <OptionSwitchRow
      key={option.key}
      label={option.label}
      description={option.description}
      checked={option.checked}
      nested={option.nested}
      // oxlint-disable-next-line react/jsx-handler-names -- forwarded store setter, name fixed by the descriptor
      onCheckedChange={option.onCheckedChange}
    />
  ));

  if (compact) {
    return (
      <>
        {displayModeToggle}
        <MobileOptionsDrawer>
          {hasThumbnails && (
            <div className="flex min-w-0 items-center gap-2">
              <p className="text-muted-foreground w-18 text-xs font-medium">Columns</p>
              <ColumnControls
                compact
                maxColumns={columnOverride}
                autoColumns={autoColumns}
                minColumns={minColumns}
                maxColumnsLimit={maxColumnsLimit}
                onMaxColumnsChange={setColumns}
              />
            </div>
          )}
          <DeckOrderingControl compact ordering={ordering} />
          {optionSwitchRows.length > 0 && (
            <div className="flex flex-col gap-4 border-t pt-4">{optionSwitchRows}</div>
          )}
        </MobileOptionsDrawer>
      </>
    );
  }

  const optionsModified = optionSwitches.some((option) => option.modified);

  // The switches sit behind one trigger rather than a run of tooltip-only
  // icon buttons: the row then speaks a single visual language (every control
  // outlined and h-8), keeps its width when a display mode hides a switch,
  // and shows the same labelled list the phone drawer does.
  const optionsPopover = optionSwitches.length > 0 && (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="icon" />}
        className="relative"
        aria-label={optionsModified ? "Display options, changed" : "Display options"}
      >
        <SlidersHorizontalIcon className="size-4" />
        {optionsModified && (
          // Same changed-state dot the filter customize control uses, kept
          // inside the button bounds so nothing clips it.
          <span className="bg-primary ring-background absolute top-0.5 right-0.5 size-2 rounded-full ring-2" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-4">
        {optionSwitchRows}
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex items-center gap-2">
      {hasThumbnails && (
        // Same control the card browser and deck check use: fewer columns means
        // bigger cards, and the middle label resets to the measured Auto. Full
        // size (not compact) so it shares the h-8 line of the sort control and
        // the view toggle beside it.
        <ColumnControls
          maxColumns={columnOverride}
          autoColumns={autoColumns}
          minColumns={minColumns}
          maxColumnsLimit={maxColumnsLimit}
          onMaxColumnsChange={setColumns}
        />
      )}
      <DeckOrderingControl ordering={ordering} />
      {displayModeToggle}
      {/* After the view toggle, matching the phone row where the options
          drawer follows the same switch. */}
      {optionsPopover}
      {/* This surface has a detail pane but no card-browser toolbar, so the
          dock toggle lives here — otherwise the pane would only be reachable
          from the detail modal's footer link. Kept last so it sits at the far
          right, the same end of the row it occupies on the browser toolbar. */}
      <DetailPaneToggle />
    </div>
  );
}
