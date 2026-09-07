export const COMMONS_PER_PACK = 7;

export const UNCOMMONS_PER_PACK = 3;

export const FLEX_SLOTS_PER_PACK = 2;

export const FLEX_EPIC_RATE = 1 - Math.sqrt(0.75);

export const SHOWCASE_ALTART_RATE = 2 / 24;

export const SHOWCASE_OVERNUMBERED_RATE = 1 / 72;

export const SHOWCASE_SIGNED_RATE = 1 / 720;

export const ULTIMATE_RATE = 0.001;

export const FOIL_RARITY_WEIGHTS: Readonly<Record<string, number>> = {
  common: 0.7,
  uncommon: 0.25,
  rare: 0.04,
  epic: 0.01,
};

export const TOKEN_SLOT_ALTART_RUNE_RATE = 0.005;

export const TOKEN_SLOT_FOIL_RUNE_RATE = 0.06;

export const TOKEN_SLOT_TOKEN_RATE = 0.08;
