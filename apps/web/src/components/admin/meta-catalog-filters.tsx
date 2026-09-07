import { META_CATALOG_DISPLAY_STATUSES } from "@openrift/shared";
import type { MetaCatalogTriage } from "@openrift/shared/contracts/admin/meta-catalog";

import { AdminFilterSelect, AdminFilterSwitch } from "@/components/admin/admin-filters";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
import { CatalogSourceSelect } from "@/components/admin/meta-catalog-shared";
import type { TriageCounts } from "@/components/admin/meta-triage-filter";
import { ANY, TriageFilterSelect } from "@/components/admin/meta-triage-filter";
import { PageDescription } from "@/components/layout/page-top-bar";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { catalogStatusDisplay } from "@/lib/meta-catalog-display";
import type { MetaSearch } from "@/routes/_app/_authenticated/admin/meta";

const STATUS_OPTIONS = [
  { value: ANY, label: "Any status" },
  ...META_CATALOG_DISPLAY_STATUSES.map((status) => ({
    value: status,
    label: catalogStatusDisplay(status).label,
  })),
];

/** Narrows a status select's value to what the URL carries. */
function catalogStatusParam(value: string): MetaSearch["eventStatus"] {
  return META_CATALOG_DISPLAY_STATUSES.find((status) => status === value);
}

// Every control writes straight to the URL through `applyFilter`; nothing
// here holds filter state of its own.
export function CatalogFilters({
  filters,
  triage,
  counts,
  total,
  applyFilter,
}: {
  filters: MetaSearch;
  triage: MetaCatalogTriage | "any";
  counts?: TriageCounts;
  total: number;
  applyFilter: (next: Partial<MetaSearch>) => void;
}) {
  const [minPlayersInput, setMinPlayersInput] = useSearchUrlSync({
    urlValue: filters.minPlayers === undefined ? "" : String(filters.minPlayers),
    onCommit: (value) =>
      applyFilter({ minPlayers: /^\d+$/u.test(value) ? Number(value) : undefined }),
  });

  return (
    <div className="space-y-3">
      <PageDescription>
        Every Riftbound event uvsgames lists, as of the last sync. Accept an event to publish it on
        /meta: this creates its public event page and fetches its standings and any published
        decklists. Dismiss the ones /meta should never carry; they stay hidden even if uvsgames
        updates them.
      </PageDescription>
      <div className="flex flex-wrap items-center gap-2">
        <CatalogSourceSelect source={filters.source ?? "uvsgames"} applyFilter={applyFilter} />
        <DebouncedSearchInput
          urlValue={filters.q ?? ""}
          onCommit={(value) => applyFilter({ q: value === "" ? undefined : value })}
          placeholder="Search event names"
          className="w-64"
        />
        <TriageFilterSelect
          selected={triage}
          counts={counts}
          onChange={(next) => applyFilter({ triage: next })}
        />
        <AdminFilterSelect
          value={filters.eventStatus ?? ANY}
          onChange={(value) => applyFilter({ eventStatus: catalogStatusParam(value) })}
          options={STATUS_OPTIONS}
          className="w-40"
          label="Event status"
        />
        <Input
          type="number"
          min={0}
          value={minPlayersInput}
          onChange={(event) => setMinPlayersInput(event.target.value)}
          placeholder="Min players"
          aria-label="Minimum players"
          className="w-32"
        />
        <DatePicker
          value={filters.dateFrom ?? ""}
          onChange={(value) => applyFilter({ dateFrom: value })}
          onClear={() => applyFilter({ dateFrom: undefined })}
          placeholder="From"
          className="w-40"
        />
        <DatePicker
          value={filters.dateTo ?? ""}
          onChange={(value) => applyFilter({ dateTo: value })}
          onClear={() => applyFilter({ dateTo: undefined })}
          placeholder="To"
          className="w-40"
        />
        <AdminFilterSwitch
          id="meta-catalog-decklists"
          checked={filters.decklists ?? false}
          onChange={(checked) => applyFilter({ decklists: checked || undefined })}
        >
          Decklists published
        </AdminFilterSwitch>
        <AdminFilterSwitch
          id="meta-catalog-missing"
          checked={filters.missing ?? false}
          onChange={(checked) => applyFilter({ missing: checked || undefined })}
        >
          Gone from the listing
        </AdminFilterSwitch>
        <AdminFilterSwitch
          id="meta-catalog-awaiting"
          checked={filters.awaitingResults ?? false}
          onChange={(checked) => applyFilter({ awaitingResults: checked || undefined })}
        >
          Awaiting results
        </AdminFilterSwitch>
      </div>
      <p className="text-muted-foreground">
        {total} matching {total === 1 ? "event" : "events"}.
      </p>
    </div>
  );
}
