import type { MetaCatalogTriage } from "@openrift/shared/contracts/admin/meta-catalog";
import { PLAYLOLTCG_STATUSES } from "@openrift/shared/types/enums";

import { AdminFilterSelect, AdminFilterSwitch } from "@/components/admin/admin-filters";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
import { CatalogSourceSelect } from "@/components/admin/meta-catalog-shared";
import type { TriageCounts } from "@/components/admin/meta-triage-filter";
import { ANY, TriageFilterSelect } from "@/components/admin/meta-triage-filter";
import { PageDescription } from "@/components/layout/page-top-bar";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import type { MetaSearch } from "@/lib/admin-meta-search";
import { PLAYLOLTCG_STATUS_CHOICES } from "@/lib/meta-catalog-display";

const STATUS_OPTIONS = [{ value: ANY, label: "Any status" }, ...PLAYLOLTCG_STATUS_CHOICES];

function playloltcgStatusParam(value: string): MetaSearch["plStatus"] {
  return PLAYLOLTCG_STATUSES.find((status) => String(status) === value);
}

// The uvsgames row's twin, minus the decklist filter: the source has no
// decklist-status field.
export function PlayloltcgCatalogFilters({
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
        Every Riftbound event the Chinese app lists, as of the last sync. Accept an event to publish
        it on /meta: this creates its public event page and fetches its standings and any published
        decklists. Dismiss the ones /meta should never carry.
      </PageDescription>
      <div className="flex flex-wrap items-center gap-2">
        <CatalogSourceSelect source={filters.source ?? "uvsgames"} applyFilter={applyFilter} />
        <DebouncedSearchInput
          urlValue={filters.q ?? ""}
          onCommit={(value) => applyFilter({ q: value === "" ? undefined : value })}
          placeholder="Search event or shop"
          className="w-64"
        />
        <TriageFilterSelect
          selected={triage}
          counts={counts}
          onChange={(next) => applyFilter({ triage: next })}
        />
        <AdminFilterSelect
          value={filters.plStatus === undefined ? ANY : String(filters.plStatus)}
          onChange={(value) => applyFilter({ plStatus: playloltcgStatusParam(value) })}
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
          id="playloltcg-catalog-missing"
          checked={filters.missing ?? false}
          onChange={(checked) => applyFilter({ missing: checked || undefined })}
        >
          Gone from the listing
        </AdminFilterSwitch>
        <AdminFilterSwitch
          id="playloltcg-catalog-awaiting"
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
