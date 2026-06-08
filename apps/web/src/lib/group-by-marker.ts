import type { CardViewerItem } from "@/components/card-viewer-types";
import type { GroupInfo } from "@/components/cards/card-grid-types";

export interface CardMarkerGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}

export const UNMARKED_ID = "_unmarked";
export const UNMARKED_LABEL = "Unmarked";

/**
 * Group items by marker. An item with N markers fans out into N sections —
 * a Worlds-Top-8 foil belongs to both the "Top 8" and "Foil" buckets.
 * Items with no markers collect into a trailing "Unmarked" section, always
 * last regardless of direction.
 *
 * @returns Marker sections plus an optional trailing unmarked section.
 */
export function groupItemsByMarker(
  items: CardViewerItem[],
  dir: "asc" | "desc",
): CardMarkerGroup[] {
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
  const sections: CardMarkerGroup[] = ordered.map(([slug, bucket]) => ({
    // id keeps the slug for scroll/scrub keys; slug is blank so the header shows
    // only the label (a marker's slug is just the lowercased echo of its label).
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
