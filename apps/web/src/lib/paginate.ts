export type PageItem = number | "ellipsis";

/** First page, last page, and a window of `siblings` pages around `current`, with ellipsis markers for gaps. */
export function getPageItems(current: number, totalPages: number, siblings = 1): PageItem[] {
  const total = Math.max(1, Math.trunc(totalPages));
  if (total <= 1) {
    return [1];
  }
  if (total <= siblings * 2 + 5) {
    return Array.from({ length: total }, (_unused, index) => index + 1);
  }

  const clamped = Math.min(Math.max(1, Math.trunc(current)), total);
  const pages = new Set<number>([1, total]);
  for (let page = clamped - siblings; page <= clamped + siblings; page++) {
    if (page >= 1 && page <= total) {
      pages.add(page);
    }
  }

  const items: PageItem[] = [];
  let previous = 0;
  for (const page of [...pages].toSorted((a, b) => a - b)) {
    if (page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
    previous = page;
  }
  return items;
}
