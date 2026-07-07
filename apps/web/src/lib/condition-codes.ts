/**
 * Condition vocabulary mapping between OpenRift's house scale (Cardmarket's
 * 7 tiers, stored as slugs — ADR-038) and the abbreviations used by other
 * tools' CSV exports (TCGplayer-style NM/LP/MP/HP/DMG and Cardmarket-style
 * MT/EX/GD/PL/PO).
 */

const SOURCE_TO_SLUG: Record<string, string> = {
  // House slugs pass through so our own exports round-trip.
  mint: "mint",
  "near-mint": "near-mint",
  excellent: "excellent",
  good: "good",
  "light-played": "light-played",
  played: "played",
  poor: "poor",
  // Cardmarket-style codes and labels.
  m: "mint",
  mt: "mint",
  nm: "near-mint",
  "near mint": "near-mint",
  ex: "excellent",
  exc: "excellent",
  gd: "good",
  lp: "light-played",
  "light played": "light-played",
  "lightly played": "light-played",
  pl: "played",
  po: "poor",
  // TCGplayer-style tiers without a 1:1 Cardmarket match.
  sp: "excellent",
  "slightly played": "excellent",
  mp: "played",
  "moderately played": "played",
  hp: "poor",
  "heavily played": "poor",
  dmg: "poor",
  d: "poor",
  damaged: "poor",
};

/**
 * Maps a source CSV condition cell to a house condition slug.
 * @returns The slug, or undefined for blank/unrecognized values (e.g.
 *   RiftMana's "SEAL"), which import as copies without a recorded condition.
 */
export function conditionSlugFromSource(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  return SOURCE_TO_SLUG[trimmed];
}

const SLUG_TO_CODE: Record<string, string> = {
  mint: "M",
  "near-mint": "NM",
  excellent: "EX",
  good: "GD",
  "light-played": "LP",
  played: "PL",
  poor: "PO",
};

/**
 * Maps a house condition slug to its two-letter display code (Cardmarket
 * style). Used by compact UI (tile strips) and by the Piltover export.
 * Always populated for known slugs, like enum labels.
 * @returns The short condition code.
 */
export function conditionShortCode(slug: string): string {
  return SLUG_TO_CODE[slug];
}

/**
 * Maps a house condition slug to the abbreviation written in Piltover Archive
 * exports. Unrecorded (and graded) copies fall back to "NM" because the format
 * requires a value (ADR-038).
 * @returns The Piltover condition code.
 */
export function piltoverConditionCode(slug: string | null): string {
  return (slug !== null && SLUG_TO_CODE[slug]) || "NM";
}
