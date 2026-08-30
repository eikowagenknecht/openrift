import { META_CATALOG_TRIAGE } from "@openrift/shared";
import type { MetaCatalogTriage } from "@openrift/shared/contracts/admin/meta-catalog";

import { AdminFilterSelect } from "@/components/admin/admin-filters";
import { catalogTriageDisplay } from "@/lib/meta-catalog-display";
import type { MetaSearch } from "@/routes/_app/_authenticated/admin/meta";

/**
 * The "no filter" option, absent from every filter's own value set. It is also
 * the word the URL uses on the triage filter, whose default is the new queue
 * rather than no filter at all.
 */
export const ANY = "any";

/** How many rows sit in each triage bucket, as a catalogue response reports it. */
export type TriageCounts = Record<MetaCatalogTriage, number>;

/**
 * The triage bucket a URL is showing, and the value the endpoint gets for it.
 * An absent param is the new queue, which is where triage starts, so "new" is
 * never spelled out; "any" is the reader asking for no triage filter at all,
 * which no default can stand in for. Both catalogues read the same param out of
 * the same URL, so both read it this way.
 *
 * @param triage The route's `triage` search param.
 * @returns The select's value, and what to filter the query on.
 */
export function urlTriage(triage: MetaSearch["triage"] = "new"): {
  selected: MetaCatalogTriage | "any";
  query?: MetaCatalogTriage;
} {
  if (triage === ANY) {
    return { selected: triage };
  }
  return { selected: triage, query: triage };
}

/**
 * Narrows a triage select's value to what the URL carries. Picking the new
 * queue leaves the param off rather than spelling out the default.
 */
function triageParam(value: string): MetaSearch["triage"] {
  if (value === ANY) {
    return ANY;
  }
  return META_CATALOG_TRIAGE.find((triage) => triage === value && triage !== "new");
}

/**
 * The triage-bucket filter both catalogues carry, counts included.
 *
 * @returns The triage dropdown.
 */
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
