/**
 * Condition vocabulary mapping between OpenRift's house scale (Cardmarket's
 * 7 tiers) and the abbreviations used in other tools' CSV exports
 * (TCGplayer-style NM/LP/MP/HP/DMG, Cardmarket-style MT/EX/GD/PL/PO).
 */

import { enumLabel } from "@openrift/shared/enum-label";

const SOURCE_TO_SLUG: Record<string, string> = {
  mint: "mint",
  "near-mint": "near-mint",
  excellent: "excellent",
  good: "good",
  "light-played": "light-played",
  played: "played",
  poor: "poor",
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

/** Returns undefined for blank/unrecognized values (e.g. RiftMana's "SEAL"), imported without a recorded condition. */
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

/** Always populated for known slugs, like enum labels. */
export function conditionShortCode(slug: string): string {
  return enumLabel(SLUG_TO_CODE, slug);
}

/** Unrecorded and graded copies fall back to "NM" because the export format requires a value. */
export function piltoverConditionCode(slug: string | null): string {
  return (slug !== null && SLUG_TO_CODE[slug]) || "NM";
}
