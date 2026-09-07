import { legendDisplayName } from "@openrift/shared/utils";

import type { CardGroup } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";

/** Only meaningful in printings view; in cards view every section holds exactly one tile. */
export function groupItemsByCard(items: CardViewerItem[], dir: "asc" | "desc"): CardGroup[] {
  const buckets = new Map<string, { name: string; items: CardViewerItem[] }>();
  for (const item of items) {
    const { slug } = item.printing.card;
    const name = legendDisplayName(item.printing.card);
    const existing = buckets.get(slug);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(slug, { name, items: [item] });
    }
  }
  const sorted = [...buckets.entries()].toSorted(([, a], [, b]) => a.name.localeCompare(b.name));
  const ordered = dir === "desc" ? sorted.toReversed() : sorted;
  return ordered.map(([slug, bucket]) => ({
    group: { id: slug, slug: "", name: bucket.name },
    items: bucket.items,
  }));
}
