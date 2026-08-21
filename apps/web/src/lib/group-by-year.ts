import type { CardViewerItem } from "@/components/card-viewer-types";
import type { CardGroup } from "@/components/cards/card-grid-types";

export const UNKNOWN_YEAR_ID = "_unknown-year";
export const UNKNOWN_YEAR_LABEL = "Unknown year";

/**
 * Group items by `printing.printedYear` (the year stamped on the physical card).
 * Sections sort by year (oldest-first when asc, newest-first when desc).
 * Items with `printedYear === null` collect into a trailing "Unknown year"
 * section that stays last regardless of direction — same pattern as the
 * "(No distribution channel)" bucket in group-by-channel.
 *
 * @returns Year sections plus an optional trailing unknown-year section.
 */
export function groupItemsByYear(items: CardViewerItem[], dir: "asc" | "desc"): CardGroup[] {
  const byYear = new Map<number, CardViewerItem[]>();
  const unknown: CardViewerItem[] = [];
  for (const item of items) {
    const year = item.printing.printedYear;
    if (year === null) {
      unknown.push(item);
      continue;
    }
    const list = byYear.get(year);
    if (list) {
      list.push(item);
    } else {
      byYear.set(year, [item]);
    }
  }
  const compare = dir === "asc" ? (a: number, b: number) => a - b : (a: number, b: number) => b - a;
  const sections: CardGroup[] = [...byYear.entries()]
    .toSorted(([yearA], [yearB]) => compare(yearA, yearB))
    .map(([year, list]) => ({
      group: { id: String(year), slug: "", name: String(year) },
      items: list,
    }));
  if (unknown.length > 0) {
    sections.push({
      group: { id: UNKNOWN_YEAR_ID, slug: "", name: UNKNOWN_YEAR_LABEL },
      items: unknown,
    });
  }
  return sections;
}
