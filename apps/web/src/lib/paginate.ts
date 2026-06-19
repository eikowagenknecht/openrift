/** A token in a numbered pager: a 1-based page number, or a gap marker. */
export type PageItem = number | "ellipsis";

/**
 * Compute the page tokens to render in a numbered pager. Always includes the
 * first and last page and a window of `siblings` pages on each side of the
 * current page, inserting an `"ellipsis"` marker wherever pages are skipped.
 * When the total is small enough that no pages would be hidden, every page is
 * returned with no ellipsis. `current` is clamped into `[1, totalPages]`.
 * @returns Ordered page items (page numbers and ellipsis markers).
 */
export function getPageItems(current: number, totalPages: number, siblings = 1): PageItem[] {
  const total = Math.max(1, Math.trunc(totalPages));
  if (total <= 1) {
    return [1];
  }
  // Up to this many pages, showing them all is shorter than (or equal to) the
  // windowed form, so skip the ellipsis entirely: first + last + the 2*siblings
  // window + the two ellipsis slots they would replace.
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
