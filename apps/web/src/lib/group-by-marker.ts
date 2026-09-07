import type { CardGroup } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";

export const UNMARKED_ID = "_unmarked";
export const UNMARKED_LABEL = "Unmarked";

export function groupItemsByMarker(items: CardViewerItem[], dir: "asc" | "desc"): CardGroup[] {
  const buckets = new Map<string, { label: string; items: CardViewerItem[] }>();
  const unmarked: CardViewerItem[] = [];
  for (const item of items) {
    const markers = item.printing.markers;
    if (markers.length === 0) {
      unmarked.push(item);
      continue;
    }
    for (const marker of markers) {
      const existing = buckets.get(marker.slug);
      if (existing) {
        existing.items.push(item);
      } else {
        buckets.set(marker.slug, { label: marker.label, items: [item] });
      }
    }
  }
  const sorted = [...buckets.entries()].toSorted(([, a], [, b]) => a.label.localeCompare(b.label));
  const ordered = dir === "desc" ? sorted.toReversed() : sorted;
  const sections: CardGroup[] = ordered.map(([slug, bucket]) => ({
    group: { id: slug, slug: "", name: bucket.label },
    items: bucket.items,
  }));
  if (unmarked.length > 0) {
    sections.push({
      group: { id: UNMARKED_ID, slug: "", name: UNMARKED_LABEL },
      items: unmarked,
    });
  }
  return sections;
}
