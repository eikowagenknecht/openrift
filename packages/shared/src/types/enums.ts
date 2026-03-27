// If you add a value here, also update the CHECK constraint in a new migration
// (see 001-core-schema.ts — chk_cards_type).
export type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield" | "Other";

// If you add a value here, also update the CHECK constraint in a new migration
// (see 001-core-schema.ts — chk_printings_rarity).
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

export type Domain = "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";

export const COLORLESS_DOMAIN: Domain = "Colorless";

export type SuperType = "Basic" | "Champion" | "Signature" | "Token";

export type CardFace = "front" | "back";

export type ArtVariant = "normal" | "altart" | "overnumbered";

export type Finish = "normal" | "foil";

export const DOMAIN_ORDER: readonly Domain[] = [
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
] as const;

export const RARITY_ORDER: readonly Rarity[] = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Showcase",
] as const;

export const ART_VARIANT_ORDER: readonly ArtVariant[] = [
  "normal",
  "altart",
  "overnumbered",
] as const;

export const FINISH_ORDER: readonly Finish[] = ["normal", "foil"] as const;

export const CARD_TYPE_ORDER: readonly CardType[] = [
  "Legend",
  "Unit",
  "Rune",
  "Spell",
  "Gear",
  "Battlefield",
  "Other",
] as const;

export const SUPER_TYPE_ORDER: readonly SuperType[] = [
  "Basic",
  "Champion",
  "Signature",
  "Token",
] as const;

// If you add a value here, also update the CHECK constraint in a new migration
// (see 009-collection-tracking.ts — chk_activities_type).
export type ActivityType = "acquisition" | "disposal" | "trade" | "reorganization";

// If you add a value here, also update the CHECK constraint in a new migration
// (see 009-collection-tracking.ts — chk_activity_items_action).
export type ActivityAction = "added" | "removed" | "moved";

// If you add a value here, also update the CHECK constraint in a new migration
// (see 009-collection-tracking.ts — chk_decks_format).
export type DeckFormat = "standard" | "freeform";

// If you add a value here, also update the CHECK constraint in a new migration
// (see 009-collection-tracking.ts — chk_deck_cards_zone).
export type DeckZone = "main" | "sideboard";
