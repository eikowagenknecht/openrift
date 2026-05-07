import type { Printing, SortDirection } from "@openrift/shared";

export type PromoGrouping = "channel" | "card" | "year";

export interface PromoSection {
  id: string;
  label: string;
  printings: Printing[];
}

const UNKNOWN_YEAR_ID = "unknown";
const UNKNOWN_YEAR_LABEL = "Unknown year";

const PROMO_GROUPINGS: ReadonlySet<PromoGrouping> = new Set(["channel", "card", "year"]);

/**
 * Coerce an arbitrary URL value into a known promo grouping. Defaults to
 * "channel" so navigation from /cards (which uses "set" / "type" / etc.) lands
 * on the page's hierarchical default rather than rendering empty.
 *
 * @returns A valid PromoGrouping.
 */
export function asPromoGrouping(value: string | undefined): PromoGrouping {
  return value !== undefined && PROMO_GROUPINGS.has(value as PromoGrouping)
    ? (value as PromoGrouping)
    : "channel";
}

/**
 * Group printings by card. One section per distinct card. Sections sort
 * alphabetically by card name (asc) or reverse (desc). Within a section,
 * printings keep their input order — render layer applies the user's sort.
 *
 * @returns Sections keyed by card slug.
 */
export function groupByCard(printings: Printing[], dir: SortDirection = "asc"): PromoSection[] {
  const byCard = new Map<string, PromoSection>();
  for (const printing of printings) {
    const id = printing.card.slug;
    const existing = byCard.get(id);
    if (existing) {
      existing.printings.push(printing);
    } else {
      byCard.set(id, { id, label: printing.card.name, printings: [printing] });
    }
  }
  const sorted = [...byCard.values()].toSorted((a, b) => a.label.localeCompare(b.label));
  return dir === "desc" ? sorted.toReversed() : sorted;
}

/**
 * Group printings by `printedYear` (the year stamped on the physical card).
 * Sections sort by year (newest-first when desc, oldest-first when asc).
 * Printings with `printedYear === null` collect into an "Unknown year" bucket
 * that is always rendered last regardless of dir, since "unknown" doesn't
 * meaningfully order against numeric years.
 *
 * @returns Sections keyed by year string, with "unknown" last.
 */
export function groupByYear(printings: Printing[], dir: SortDirection = "desc"): PromoSection[] {
  const byYear = new Map<number, Printing[]>();
  const unknown: Printing[] = [];
  for (const printing of printings) {
    if (printing.printedYear === null) {
      unknown.push(printing);
      continue;
    }
    const list = byYear.get(printing.printedYear);
    if (list) {
      list.push(printing);
    } else {
      byYear.set(printing.printedYear, [printing]);
    }
  }
  const compare = dir === "asc" ? (a: number, b: number) => a - b : (a: number, b: number) => b - a;
  const sections: PromoSection[] = [...byYear.entries()]
    .toSorted(([yearA], [yearB]) => compare(yearA, yearB))
    .map(([year, list]) => ({ id: String(year), label: String(year), printings: list }));
  if (unknown.length > 0) {
    sections.push({ id: UNKNOWN_YEAR_ID, label: UNKNOWN_YEAR_LABEL, printings: unknown });
  }
  return sections;
}
