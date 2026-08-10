import type { DeckFolderResponse, Domain } from "@openrift/shared";

import { FilterIconCluster, useClusterLabelsFit } from "@/components/filters/compact-filter-bar";
import { FlagBadge } from "@/components/filters/filter-flag-badge";
import {
  FILTER_TRIGGER_ACTIVE_CLASS,
  FILTER_TRIGGER_CLASS,
  MultiSelectCombobox,
} from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import { useDeckListFilters } from "@/hooks/use-deck-list-filters";
import { useDeckFormatList, useEnumOrders } from "@/hooks/use-enums";
import type { DeckListFilterAvailability, DeckListFilterCounts } from "@/lib/deck-list-utils";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Whether any deck filter would change the result for this deck set. Hosts use
 * it to decide whether to render a filter row at all, so an empty one never
 * takes up space.
 * @returns True when at least one control is worth showing.
 */
export function hasUsableDeckFilters(
  availability: DeckListFilterAvailability,
  availableDomains: Domain[],
  folders: DeckFolderResponse[] = [],
): boolean {
  return (
    availability.hasMixedFormat ||
    availability.hasMixedValidity ||
    availability.hasArchived ||
    availableDomains.length > 1 ||
    folders.length > 0
  );
}

export interface DeckFilterControlsProps {
  availableDomains: Domain[];
  availability: DeckListFilterAvailability;
  counts: DeckListFilterCounts;
  /** The user's folders. Empty while signed out, which hides the control. */
  folders?: DeckFolderResponse[];
  /** "chip" for the mobile drawer's panel language, "button" for the compact bar. */
  triggerStyle?: "chip" | "button";
  /** Render each control on its own row, as the drawer does. */
  stacked?: boolean;
}

/**
 * The deck list's filter controls, built from the card browser's own parts so
 * the two surfaces share one visual language: a multi-select dropdown for
 * format, the tri-state flag badge for legality, and the icon cluster for
 * domains — the same cluster `/cards` uses for its own domain filter. Format
 * and domain both cycle off → include → exclude → off through the shared
 * `cycleIncludeExclude` (ADR-034).
 *
 * A control that could not change the result is left out entirely (one format,
 * no invalid decks, a single domain). That is deck-specific and deliberate:
 * these lists are small enough that a dead dropdown is noise, where the card
 * browser always has enough data for every facet to mean something.
 * @returns The controls, or null when the deck set makes all of them useless.
 */
export function DeckFilterControls({
  availableDomains,
  availability,
  counts,
  folders: folderList = [],
  triggerStyle = "button",
  stacked,
}: DeckFilterControlsProps) {
  const {
    formats,
    formatsExclude,
    validity,
    domains,
    domainsExclude,
    folders,
    foldersExclude,
    showArchived,
    hasActiveFilters,
    cycleFormat,
    cycleValidity,
    cycleDomain,
    cycleFolder,
    setShowArchived,
    clearAllFilters,
  } = useDeckListFilters();
  const { formats: formatList } = useDeckFormatList();
  const { labels: enumLabels } = useEnumOrders();
  // Same fit measurement the compact filter bar runs: the domain cluster shows
  // its labels and counts inline whenever one row still has the room.
  const { barRef, measureRef, labelsFit } = useClusterLabelsFit();

  const showFormat = availability.hasMixedFormat;
  const showValidity = availability.hasMixedValidity;
  const showDomains = availableDomains.length > 1;
  // One folder is still worth a control, unlike one format: it splits the list
  // into "in it" and "not in it", which is a real narrowing.
  const showFolders = folderList.length > 0;

  // Still render for an active filter the deck set has since made pointless —
  // a bookmarked `?domains=fury` on an all-Fury list hides every control, and
  // without this the reset button goes with them.
  if (!hasUsableDeckFilters(availability, availableDomains, folderList) && !hasActiveFilters) {
    return null;
  }

  // The drawer stacks its controls in a column with room to spare, so labels
  // are always on there; only the single-row bar has to measure.
  const domainCluster = (showLabels: boolean) =>
    showDomains ? (
      <FilterIconCluster
        label="Domain"
        options={availableDomains}
        included={domains}
        excluded={domainsExclude}
        onCycle={cycleDomain}
        iconPath={(value) => getFilterIconPath("domains", value)}
        displayLabel={(value) => formatDomainFilterLabel(value, enumLabels.domains)}
        counts={counts.domains}
        showLabels={showLabels}
      />
    ) : null;

  return (
    <div
      ref={barRef}
      className={cn(
        "relative flex gap-2",
        stacked ? "flex-col items-stretch" : "flex-wrap items-center",
      )}
    >
      {showFormat && (
        <MultiSelectCombobox
          label="Format"
          triggerStyle={triggerStyle}
          options={formatList.map((entry) => ({ value: entry.slug, label: entry.label }))}
          selected={formats}
          excluded={formatsExclude}
          onCycle={cycleFormat}
          counts={counts.formats}
        />
      )}

      {showFolders && (
        <MultiSelectCombobox
          label="Folder"
          triggerStyle={triggerStyle}
          options={folderList.map((folder) => ({ value: folder.id, label: folder.name }))}
          selected={folders}
          excluded={foldersExclude}
          onCycle={cycleFolder}
          counts={counts.folders}
        />
      )}

      {showValidity && (
        <FlagBadge
          label="Legal"
          triggerStyle={triggerStyle}
          // The flag's include/exclude cycle is exactly the validity axis:
          // require legal, require illegal, or don't care.
          state={validity === "all" ? null : validity === "valid"}
          count={
            validity === "invalid" ? counts.validity.get("invalid") : counts.validity.get("valid")
          }
          onClick={cycleValidity}
        />
      )}

      {domainCluster(stacked === true || labelsFit)}

      {/* Invisible measuring strip: the cluster as it would render with labels
          on, so the fit check knows the width labels need whatever the current
          state is — that independence is what stops the verdict oscillating.
          Out of flow, invisible, and inert. */}
      {!stacked && (
        <div
          ref={measureRef}
          data-label-fit-measure=""
          aria-hidden="true"
          inert
          className="invisible absolute top-0 left-0 flex flex-nowrap gap-2"
        >
          {domainCluster(true)}
        </div>
      )}

      {availability.hasArchived && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "font-medium",
            FILTER_TRIGGER_CLASS,
            showArchived && FILTER_TRIGGER_ACTIVE_CLASS,
          )}
          onClick={() => setShowArchived(!showArchived)}
          aria-pressed={showArchived}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      )}

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(stacked && "justify-start")}
          onClick={clearAllFilters}
        >
          Reset filters
        </Button>
      )}
    </div>
  );
}
