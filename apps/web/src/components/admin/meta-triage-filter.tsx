import { META_CATALOG_TRIAGE } from "@openrift/shared";
import type { MetaCatalogTriage } from "@openrift/shared/contracts/admin/meta-catalog";

import { AdminFilterSelect } from "@/components/admin/admin-filters";
import type { MetaSearch } from "@/lib/admin-meta-search";
import { catalogTriageDisplay } from "@/lib/meta-catalog-display";

export const ANY = "any";

export type TriageCounts = Record<MetaCatalogTriage, number>;

// An absent triage param means the new queue; "any" means no filter at all,
// which no default can stand in for.
export function urlTriage(triage: MetaSearch["triage"] = "new"): {
  selected: MetaCatalogTriage | "any";
  query?: MetaCatalogTriage;
} {
  if (triage === ANY) {
    return { selected: triage };
  }
  return { selected: triage, query: triage };
}

function triageParam(value: string): MetaSearch["triage"] {
  if (value === ANY) {
    return ANY;
  }
  return META_CATALOG_TRIAGE.find((triage) => triage === value && triage !== "new");
}

export function TriageFilterSelect({
  selected,
  counts,
  onChange,
}: {
  selected: MetaCatalogTriage | "any";
  counts?: TriageCounts;
  onChange: (next: MetaSearch["triage"]) => void;
}) {
  const options = [
    { value: ANY, label: "Any state" },
    ...META_CATALOG_TRIAGE.map((value) => {
      const label = catalogTriageDisplay(value).label;
      return { value, label: counts ? `${label} (${counts[value]})` : label };
    }),
  ];
  return (
    <AdminFilterSelect
      value={selected}
      onChange={(value) => onChange(triageParam(value))}
      options={options}
      className="w-44"
      label="Triage state"
    />
  );
}
