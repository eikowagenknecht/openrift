import type { DeckOddsGroup } from "@openrift/shared/contracts/decks";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { chanceToDraw, EARLY_DRAWS, OPENING_HAND_SIZE } from "@/features/decks/lib/deck-draw-odds";

// Must match `deckOddsGroupSchema`'s shape exactly.
export type OddsGroupDef = DeckOddsGroup;

/** Picker section a preset sorts under. */
export type OddsGroupTheme = "Curve" | "Interaction" | "Economy" | "Card types";

export interface OddsGroupPreset extends OddsGroupDef {
  theme: OddsGroupTheme;
  core?: boolean;
}

export interface OddsGroupRow {
  key: string;
  label: string;
  copies: number;
  openingChance: number;
  earlyChance: number;
}

export type GroupCard = Pick<
  DeckBuilderCard,
  "zone" | "quantity" | "cardTypes" | "keywords" | "tags" | "energy" | "might" | "power"
>;

// A numeric condition never matches a card with a null stat: "2 or less
// energy" must not include cards with no cost at all.
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

export function oddsGroupPresets(
  cards: readonly GroupCard[],
  typeLabels: Record<string, string>,
): OddsGroupPreset[] {
  const presets: OddsGroupPreset[] = [
    // Turn-1 energy is 2 going first, 3 going second.
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

export function isInformativeGroupRow(row: OddsGroupRow, deckSize: number): boolean {
  return row.copies > 0 && row.copies < deckSize;
}

const MAX_DEFAULT_GROUPS = 4;
const ADAPTIVE_MIN_COPIES = 5;
const ADAPTIVE_MIN_CHANCE = 0.2;
const ADAPTIVE_MAX_CHANCE = 0.9;

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
