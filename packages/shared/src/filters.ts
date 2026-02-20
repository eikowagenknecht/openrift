import type { Card, CardFilters, Rarity, SortOption } from "./types.js";
import { RARITY_ORDER } from "./types.js";

export function filterCards(cards: Card[], filters: CardFilters): Card[] {
  return cards.filter((card) => {
    if (filters.search && !card.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.sets.length > 0 && !filters.sets.includes(card.set)) {
      return false;
    }
    if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) {
      return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(card.type)) {
      return false;
    }
    if (filters.factions.length > 0 && !filters.factions.includes(card.faction)) {
      return false;
    }
    if (filters.costMin !== null && card.cost < filters.costMin) {
      return false;
    }
    if (filters.costMax !== null && card.cost > filters.costMax) {
      return false;
    }
    return true;
  });
}

export interface AvailableFilters {
  sets: string[];
  rarities: Rarity[];
  types: string[];
  factions: string[];
  costMin: number;
  costMax: number;
}

export function getAvailableFilters(cards: Card[]): AvailableFilters {
  const sets = [...new Set(cards.map((c) => c.set))].sort();
  const rarities = [...new Set(cards.map((c) => c.rarity))].sort(
    (a, b) => RARITY_ORDER[a] - RARITY_ORDER[b],
  ) as Rarity[];
  const types = [...new Set(cards.map((c) => c.type))].sort();
  const factions = [...new Set(cards.map((c) => c.faction))].sort();
  const costs = cards.map((c) => c.cost);
  return {
    sets,
    rarities,
    types,
    factions,
    costMin: Math.min(...costs),
    costMax: Math.max(...costs),
  };
}

export function sortCards(cards: Card[], sortBy: SortOption): Card[] {
  const sorted = [...cards];
  switch (sortBy) {
    case "name": {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    }
    case "collectorNumber": {
      sorted.sort((a, b) => {
        const setCompare = a.set.localeCompare(b.set);
        if (setCompare !== 0) {
          return setCompare;
        }
        return a.collectorNumber - b.collectorNumber;
      });
      break;
    }
    case "cost": {
      sorted.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
      break;
    }
    case "rarity": {
      sorted.sort(
        (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name),
      );
      break;
    }
  }
  return sorted;
}
