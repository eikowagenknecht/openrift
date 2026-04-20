/**
 * Pack-opener pull rates. Rates marked PUBLISHED come from Riot's Origins
 * announcement; rates marked ESTIMATE are community estimates because Riot
 * didn't publish exact numbers. Change a single constant here to retune.
 *
 * Sources:
 * - Riot (Aug 2025): Collectability in Riftbound: Origins
 * - Harlequins Games: Riftbound pull rates summary (mirrors Riot)
 */

/** Number of Common cards per pack. PUBLISHED. */
export const COMMONS_PER_PACK = 7;

/** Number of Uncommon cards per pack. PUBLISHED. */
export const UNCOMMONS_PER_PACK = 3;

/** Number of Rare-or-better (flex) slots per pack. PUBLISHED. */
export const FLEX_SLOTS_PER_PACK = 2;

/**
 * Probability that any given flex slot rolls an Epic instead of a Rare.
 * Derived from Riot's "1 in 4 packs contains an Epic". With two independent
 * flex slots, P(≥1 Epic) = 1 - (1 - p)^2 = 0.25, so p = 1 - sqrt(0.75) ≈ 0.1340.
 * This yields ~1.79% chance of two Epics in one pack — matches "possible".
 */
export const FLEX_EPIC_RATE = 1 - Math.sqrt(0.75);

/**
 * Per-pack rate of pulling a Showcase alt-art card. PUBLISHED: 2 per 24-pack box.
 * Replaces the foil slot.
 */
export const SHOWCASE_ALTART_RATE = 2 / 24;

/**
 * Per-pack rate of pulling an overnumbered Showcase. PUBLISHED: 1 per 3 boxes.
 * Replaces the foil slot.
 */
export const SHOWCASE_OVERNUMBERED_RATE = 1 / 72;

/**
 * Per-pack rate of pulling a signed Showcase. PUBLISHED: 1 per 10 overnumbered,
 * i.e. 1 per 720 packs. Replaces the foil slot.
 */
export const SHOWCASE_SIGNED_RATE = 1 / 720;

/**
 * Per-pack rate of pulling an Ultimate (UNL-only so far: Baron Nashor).
 * PUBLISHED: "< 0.1% of packs". We use exactly 0.1% as the headline figure.
 * Replaces the foil slot. Only applied when the pool has ultimate printings.
 */
export const ULTIMATE_RATE = 0.001;

/**
 * Foil slot rarity mix when the foil slot is a regular (non-showcase, non-ultimate)
 * foil. ESTIMATE — Riot never published exact upgrade percentages; they only say
 * "usually common or uncommon, can upgrade to rare or epic". These values sum to
 * 1.0 and produce a "mostly common/uncommon" distribution consistent with that
 * description. Tune here if more authoritative data becomes available.
 */
export const FOIL_RARITY_WEIGHTS: Readonly<Record<string, number>> = {
  common: 0.7,
  uncommon: 0.25,
  rare: 0.04,
  epic: 0.01,
};
