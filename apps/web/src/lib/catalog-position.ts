/** A printing's place in the catalog: its set's order, then its card number. */
export interface CatalogPosition {
  setIndex: number;
  shortCode: string;
}

// shortCode's zero-padded number sorts as a plain string ("OGN-002" before "OGN-010").
export function compareCatalogPosition(a: CatalogPosition, b: CatalogPosition): number {
  return a.setIndex - b.setIndex || a.shortCode.localeCompare(b.shortCode);
}
