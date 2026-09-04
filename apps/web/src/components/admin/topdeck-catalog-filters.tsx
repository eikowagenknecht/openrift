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
import { TOPDECK_FORMAT_CHOICES } from "@/lib/meta-catalog-display";
import type { MetaSearch } from "@/routes/_app/_authenticated/admin/meta";

const FORMAT_OPTIONS = [{ value: ANY, label: "Any format" }, ...TOPDECK_FORMAT_CHOICES];

/**
 * The source answers about completed tournaments only, so there is no lifecycle
 * to filter and nothing can be awaiting results. Its format word takes that slot.
 */
export function TopdeckCatalogFilters({
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
        Every completed Riftbound tournament TopDeck.gg lists, with its standings and any decklists
        the players submitted. Accept an event to publish it on /meta. Dismiss the ones /meta should
        never carry.
      </PageDescription>
      <div className="flex flex-wrap items-center gap-2">
        <CatalogSourceSelect source={filters.source ?? "uvsgames"} applyFilter={applyFilter} />
        <DebouncedSearchInput
          urlValue={filters.q ?? ""}
          onCommit={(value) => applyFilter({ q: value === "" ? undefined : value })}
          placeholder="Search event or city"
          className="w-64"
        />
        <TriageFilterSelect
          selected={triage}
          counts={counts}
          onChange={(next) => applyFilter({ triage: next })}
        />
        <AdminFilterSelect
          value={filters.tdFormat ?? ANY}
          onChange={(value) => applyFilter({ tdFormat: value === ANY ? undefined : value })}
          options={FORMAT_OPTIONS}
          className="w-40"
          label="Source format"
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
          id="topdeck-catalog-missing"
          checked={filters.missing ?? false}
          onChange={(checked) => applyFilter({ missing: checked || undefined })}
        >
          Gone from the listing
        </AdminFilterSwitch>
      </div>
      <p className="text-muted-foreground">
        {total} matching {total === 1 ? "event" : "events"}.
      </p>
    </div>
  );
}
