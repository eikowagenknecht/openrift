/** A printing's place in the catalog: its set's order, then its card number. */
export interface CatalogPosition {
  setIndex: number;
  shortCode: string;
}

/**
 * Orders two printings the way the catalog does: by set, then by short code,
 * whose zero-padded number sorts as a plain string ("OGN-002" before "OGN-010").
 * @param a The first position.
 * @param b The second position.
 * @returns Negative when `a` comes first, positive when `b` does, 0 when equal.
 */
export function compareCatalogPosition(a: CatalogPosition, b: CatalogPosition): number {
  return a.setIndex - b.setIndex || a.shortCode.localeCompare(b.shortCode);
}
