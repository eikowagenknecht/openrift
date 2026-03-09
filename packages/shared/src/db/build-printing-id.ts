/**
 * Build composite printing ID.
 * @returns Deterministic ID string: "{source_id}:{art_variant}:{signed|}:{promo|}:{finish}"
 */
export function buildPrintingId(
  sourceId: string,
  artVariant: string,
  isSigned: boolean,
  isPromo: boolean,
  finish: string,
): string {
  return `${sourceId}:${artVariant}:${isSigned ? "signed" : ""}:${isPromo ? "promo" : ""}:${finish}`;
}
