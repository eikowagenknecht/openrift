import type { DeckOddsGroup } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { chanceToDraw, EARLY_DRAWS, OPENING_HAND_SIZE } from "@/lib/deck-draw-odds";

/**
 * Declarative card group for the odds table: an AND of optional per-field
 * conditions, where list fields mean any-of. Everything is structured card
 * data — no rules-text interpretation. The shape is the shared
 * `deckOddsGroupSchema`, so custom groups round-trip through the deck's
 * server-stored odds config unchanged.
 */
export type OddsGroupDef = DeckOddsGroup;

/** Picker section a preset sorts under. */
export type OddsGroupTheme = "Curve" | "Interaction" | "Economy" | "Card types";

export interface OddsGroupPreset extends OddsGroupDef {
  theme: OddsGroupTheme;
  /** Layer 1: enabled by default whenever informative for the deck. */
  core?: boolean;
}

/** One computed odds row for a group. */
export interface OddsGroupRow {
  key: string;
  label: string;
  copies: number;
  /** Chance of at least one group member in the opening hand. */
  openingChance: number;
  /** Chance of at least one group member among the first {@link EARLY_DRAWS} cards. */
  earlyChance: number;
}

type GroupCard = Pick<
  DeckBuilderCard,
  "zone" | "quantity" | "cardTypes" | "keywords" | "tags" | "energy" | "might" | "power"
>;

/**
 * Whether a card satisfies every condition a group defines. A numeric
 * condition on a card without that stat (null energy/might/power) never
 * matches — "2 or less energy" should not include cards with no cost at all.
 * @returns True when the card belongs to the group.
 */
export function cardMatchesOddsGroup(card: GroupCard, def: OddsGroupDef): boolean {
  if (def.types && !def.types.some((type) => card.cardTypes.includes(type))) {
    return false;
  }
  if (def.keywords && !def.keywords.some((keyword) => card.keywords.includes(keyword))) {
    return false;
  }
  if (def.tags && !def.tags.some((tag) => card.tags.includes(tag))) {
    return false;
  }
  if (def.energyMin !== undefined && (card.energy === null || card.energy < def.energyMin)) {
    return false;
  }
  if (def.energyMax !== undefined && (card.energy === null || card.energy > def.energyMax)) {
    return false;
  }
  if (def.mightMin !== undefined && (card.might === null || card.might < def.mightMin)) {
    return false;
  }
  if (def.powerMin !== undefined && (card.power === null || card.power < def.powerMin)) {
    return false;
  }
  return true;
}

const UNIT = WellKnown.cardType.UNIT;

/**
 * The preset library, layer 3: every group the picker offers, themed. Static
 * entries first, then one "Any <type>" per card type in the main deck, then
 * the champion-synergy group when a legend with a tag is set.
 * @returns The presets for this deck.
 */
export function oddsGroupPresets(
  cards: readonly GroupCard[],
  typeLabels: Record<string, string>,
): OddsGroupPreset[] {
  const presets: OddsGroupPreset[] = [
    // Curve. Turn-1 energy is 2 going first and 3 going second, so those are
    // the thresholds that matter. Units and gear are both standalone plays;
    // a cheap spell in the opener is not a turn-1 *play* (nothing to react
    // to yet), so spells don't count here.
    // The unit-only row is the core default: a naked turn-1 gear is deck-
    // dependent at best, so the broader unit/gear rows stay picker options.
    {
      key: "turn-one-first-unit",
      label: "Turn-1 unit going first (≤2 energy)",
      theme: "Curve",
      types: [UNIT],
      energyMax: 2,
      core: true,
    },
    {
      key: "turn-one-first",
      label: "Turn-1 play going first (≤2 unit/gear)",
      theme: "Curve",
      types: [UNIT, WellKnown.cardType.GEAR],
      energyMax: 2,
    },
    {
      key: "turn-one-second",
      label: "Turn-1 play going second (≤3 unit/gear)",
      theme: "Curve",
      types: [UNIT, WellKnown.cardType.GEAR],
      energyMax: 3,
    },
    {
      key: "turn-one-second-unit",
      label: "Turn-1 unit going second (≤3 energy)",
      theme: "Curve",
      types: [UNIT],
      energyMax: 3,
    },
    {
      key: "two-cost-unit",
      label: "2-cost unit",
      theme: "Curve",
      types: [UNIT],
      energyMin: 2,
      energyMax: 2,
    },
    {
      key: "three-cost-unit",
      label: "3-cost unit",
      theme: "Curve",
      types: [UNIT],
      energyMin: 3,
      energyMax: 3,
    },
    { key: "top-end", label: "Top end (5+ energy)", theme: "Curve", energyMin: 5 },
    // Interaction
    {
      key: "combat-trick",
      label: "Combat trick (Action/Reaction spell)",
      theme: "Interaction",
      types: ["spell"],
      keywords: ["Action", "Reaction"],
      core: true,
    },
    {
      key: "reaction-speed",
      label: "Reaction speed",
      theme: "Interaction",
      keywords: ["Reaction"],
    },
    {
      key: "surprise-threat",
      label: "Surprise threat (Hidden/Ambush)",
      theme: "Interaction",
      types: [UNIT],
      keywords: ["Hidden", "Ambush"],
    },
    {
      key: "defensive-tool",
      label: "Defensive tool (Deflect/Shield/Tank)",
      theme: "Interaction",
      keywords: ["Deflect", "Shield", "Tank"],
    },
    {
      key: "aggro-enabler",
      label: "Aggro enabler (Assault/Ganking)",
      theme: "Interaction",
      types: [UNIT],
      keywords: ["Assault", "Ganking"],
    },
    {
      key: "disruption",
      label: "Disruption (Stun/Burn)",
      theme: "Interaction",
      keywords: ["Stun", "Burn"],
    },
    // Economy
    {
      key: "ramp",
      label: "Ramp (Accelerate/Add)",
      theme: "Economy",
      keywords: ["Accelerate", "Add"],
    },
    {
      key: "death-value",
      label: "Death value (Deathknell)",
      theme: "Economy",
      keywords: ["Deathknell"],
    },
    { key: "big-body", label: "Big body (5+ might)", theme: "Economy", types: [UNIT], mightMin: 5 },
    { key: "rune-payoff", label: "Rune payoff (2+ power)", theme: "Economy", powerMin: 2 },
  ];

  const mainCards = cards.filter((card) => card.zone === WellKnown.deckZone.MAIN);
  const presentTypes = [...new Set(mainCards.flatMap((card) => card.cardTypes))];
  for (const type of presentTypes) {
    presets.push({
      key: `type-${type}`,
      label: `Any ${typeLabels[type]}`,
      theme: "Card types",
      types: [type],
    });
  }

  return presets;
}

/**
 * Computes a group's odds row over the drawn main deck.
 * @returns The row; copies is 0 when nothing matches.
 */
export function oddsGroupRow(cards: readonly GroupCard[], def: OddsGroupDef): OddsGroupRow {
  const mainCards = cards.filter((card) => card.zone === WellKnown.deckZone.MAIN);
  const deckSize = mainCards.reduce((sum, card) => sum + card.quantity, 0);
  const copies = mainCards
    .filter((card) => cardMatchesOddsGroup(card, def))
    .reduce((sum, card) => sum + card.quantity, 0);
  return {
    key: def.key,
    label: def.label,
    copies,
    openingChance: chanceToDraw(copies, deckSize, OPENING_HAND_SIZE),
    earlyChance: chanceToDraw(copies, deckSize, EARLY_DRAWS),
  };
}

/**
 * A group row is informative when its odds could change a decision: it covers
 * some cards but not the whole deck.
 * @returns True when the row is worth showing.
 */
export function isInformativeGroupRow(row: OddsGroupRow, deckSize: number): boolean {
  return row.copies > 0 && row.copies < deckSize;
}

/** Cap on default rows so the group block stays above the per-card table. */
const MAX_DEFAULT_GROUPS = 4;
/** Adaptive picks need to be a real slice of the deck. */
const ADAPTIVE_MIN_COPIES = 5;
/** The "decision band": odds outside it rarely change a mulligan. */
const ADAPTIVE_MIN_CHANCE = 0.2;
const ADAPTIVE_MAX_CHANCE = 0.9;

/**
 * The suggested default selection: core presets (layer 1) plus up to two
 * deck-adaptive picks (layer 2), scored by how close their opening-hand odds
 * sit to a coin flip — the range where the number actually decides mulligans.
 * @returns The default group keys, at most {@link MAX_DEFAULT_GROUPS}.
 */
export function defaultOddsGroupKeys(
  cards: readonly GroupCard[],
  presets: readonly OddsGroupPreset[],
): string[] {
  const mainCards = cards.filter((card) => card.zone === WellKnown.deckZone.MAIN);
  const deckSize = mainCards.reduce((sum, card) => sum + card.quantity, 0);
  if (deckSize === 0) {
    return [];
  }
  const rows = new Map(presets.map((preset) => [preset.key, oddsGroupRow(cards, preset)]));
  const informative = (preset: OddsGroupPreset) => {
    const row = rows.get(preset.key);
    return row !== undefined && isInformativeGroupRow(row, deckSize);
  };

  const core = presets.filter((preset) => preset.core && informative(preset));
  const adaptive = presets
    .filter((preset) => !preset.core && informative(preset))
    .filter((preset) => {
      const row = rows.get(preset.key);
      return (
        row !== undefined &&
        row.copies >= ADAPTIVE_MIN_COPIES &&
        row.openingChance >= ADAPTIVE_MIN_CHANCE &&
        row.openingChance <= ADAPTIVE_MAX_CHANCE
      );
    })
    .toSorted((left, right) => {
      const leftDist = Math.abs((rows.get(left.key)?.openingChance ?? 1) - 0.5);
      const rightDist = Math.abs((rows.get(right.key)?.openingChance ?? 1) - 0.5);
      return leftDist - rightDist;
    })
    .slice(0, Math.max(0, MAX_DEFAULT_GROUPS - core.length));

  return [...core, ...adaptive].map((preset) => preset.key);
}
