const COPIES_PAGE_DEFAULT = 5000;
const COPIES_PAGE_MAX = 5000;

export function clampCopiesLimit(limit?: number): number {
  return Math.min(limit ?? COPIES_PAGE_DEFAULT, COPIES_PAGE_MAX);
}
