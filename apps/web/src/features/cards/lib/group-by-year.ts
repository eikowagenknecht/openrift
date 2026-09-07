import type { CardGroup } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";

export const UNKNOWN_YEAR_ID = "_unknown-year";
export const UNKNOWN_YEAR_LABEL = "Unknown year";

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
