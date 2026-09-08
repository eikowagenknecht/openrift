export const TBA_CODE = "TBA";

export function isTbaCode(code: string): boolean {
  return code.startsWith(TBA_CODE);
}

/**
 * `uq_printings_variant` has no `card_id`, so a bare `TBA` short code collides
 * across cards. Only the public code stays bare.
 */
export function tbaShortCode(cardSlug: string): string {
  return `${TBA_CODE}-${cardSlug}`;
}

export function formatPrintingCode(publicCode: string): string {
  return isTbaCode(publicCode) ? "Code TBA" : publicCode;
}
