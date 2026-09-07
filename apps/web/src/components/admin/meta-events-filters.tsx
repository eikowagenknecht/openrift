import { META_EVENT_SOURCE_FILTERS } from "@openrift/shared";
import type { MetaEventSourceFilter } from "@openrift/shared";

import { AdminFilterSelect, AdminFilterSwitch } from "@/components/admin/admin-filters";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
import { PageDescription } from "@/components/layout/page-top-bar";
import { DatePicker } from "@/components/ui/date-picker";
import { META_SOURCE_LABELS } from "@/lib/meta-catalog-display";
import type { MetaSearch } from "@/routes/_app/_authenticated/admin/meta";

const ANY = "any";

const SOURCE_LABELS: Record<MetaEventSourceFilter, string> = {
  ...META_SOURCE_LABELS,
  usersubmission: "User submissions",
  manual: "Manual only",
};

const SOURCE_OPTIONS = [
  { value: ANY, label: "Any source" },
  ...META_EVENT_SOURCE_FILTERS.map((source) => ({ value: source, label: SOURCE_LABELS[source] })),
];

export function EventFilters({
  filters,
  formats,
  total,
  applyFilter,
}: {
  filters: MetaSearch;
  formats: { slug: string; label: string }[];
  total: number;
  applyFilter: (next: Partial<MetaSearch>) => void;
}) {
  const formatOptions = [
    { value: ANY, label: "Any format" },
    ...formats.map((format) => ({ value: format.slug, label: format.label })),
  ];

  return (
    <div className="space-y-3">
      <PageDescription>
        The live archive: exactly what visitors see on /meta. Everything here has already been
        through review, and the sources on each row lead back to the candidates it was built from.
      </PageDescription>
      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearchInput
          urlValue={filters.q ?? ""}
          onCommit={(value) => applyFilter({ q: value === "" ? undefined : value })}
          placeholder="Search names and organizers"
          className="w-64"
        />
        <AdminFilterSelect
          value={filters.liveFormat ?? ANY}
          onChange={(value) => applyFilter({ liveFormat: value === ANY ? undefined : value })}
          options={formatOptions}
          label="Format"
          className="w-44"
        />
        <AdminFilterSelect
          value={filters.liveSource ?? ANY}
          onChange={(value) =>
            applyFilter({
              liveSource: META_EVENT_SOURCE_FILTERS.find((source) => source === value),
            })
          }
          options={SOURCE_OPTIONS}
          label="Source"
          className="w-44"
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
          id="meta-events-incomplete"
          checked={filters.incompleteStandings ?? false}
          onChange={(checked) => applyFilter({ incompleteStandings: checked || undefined })}
        >
          Standings short of the field
        </AdminFilterSwitch>
        <AdminFilterSwitch
          id="meta-events-no-decks"
          checked={filters.noDecks ?? false}
          onChange={(checked) => applyFilter({ noDecks: checked || undefined })}
        >
          No decklists
        </AdminFilterSwitch>
      </div>
      <p className="text-muted-foreground">
        {total} archived {total === 1 ? "event" : "events"}.
      </p>
    </div>
  );
}
