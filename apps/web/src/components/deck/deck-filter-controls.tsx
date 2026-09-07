import type { DeckFolderResponse } from "@openrift/shared/types/api/deck";
import type { Domain } from "@openrift/shared/types/enums";

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

export function hasUsableDeckFilters(
  availability: DeckListFilterAvailability,
  availableDomains: Domain[],
  folders: DeckFolderResponse[] = [],
): boolean {
  return (
    availability.hasMixedFormat ||
    availability.hasMixedValidity ||
    availability.hasArchived ||
    availability.hasDrafts ||
    availableDomains.length > 1 ||
    folders.length > 0
  );
}

export interface DeckFilterControlsProps {
  availableDomains: Domain[];
  availability: DeckListFilterAvailability;
  counts: DeckListFilterCounts;
  folders?: DeckFolderResponse[];
  triggerStyle?: "chip" | "button";
  stacked?: boolean;
}

/**
 * A control that could not change the result is left out entirely (one
 * format, no invalid decks, a single domain).
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
    drafts,
    domains,
    domainsExclude,
    folders,
    foldersExclude,
    showArchived,
    hasActiveFilters,
    cycleFormat,
    cycleValidity,
    cycleDrafts,
    cycleDomain,
    cycleFolder,
    setShowArchived,
    clearAllFilters,
  } = useDeckListFilters();
  const { formats: formatList } = useDeckFormatList();
  const { labels: enumLabels } = useEnumOrders();
  const { barRef, measureRef, labelsFit } = useClusterLabelsFit();

  const showFormat = availability.hasMixedFormat;
  const showValidity = availability.hasMixedValidity;
  const showDrafts = availability.hasDrafts;
  const showDomains = availableDomains.length > 1;
  const showFolders = folderList.length > 0;

  if (!hasUsableDeckFilters(availability, availableDomains, folderList) && !hasActiveFilters) {
    return null;
  }

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
          state={validity === "all" ? null : validity === "valid"}
          count={
            validity === "invalid" ? counts.validity.get("invalid") : counts.validity.get("valid")
          }
          onClick={cycleValidity}
        />
      )}

      {showDrafts && (
        <FlagBadge
          label="Draft"
          triggerStyle={triggerStyle}
          state={drafts === "all" ? null : drafts === "only"}
          count={drafts === "hide" ? counts.drafts.get("hide") : counts.drafts.get("only")}
          onClick={cycleDrafts}
        />
      )}

      {domainCluster(stacked === true || labelsFit)}

      {/* Measures label width independent of the current fit state, or the
          verdict oscillates. */}
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
