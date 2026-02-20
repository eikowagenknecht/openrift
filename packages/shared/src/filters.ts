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
    if (
      filters.domains.length > 0 &&
      !card.faction.split("/").some((d) => filters.domains.includes(d))
    ) {
      return false;
    }
    if (filters.costMin !== null && card.stats.cost < filters.costMin) {
      return false;
    }
    if (filters.costMax !== null && card.stats.cost > filters.costMax) {
      return false;
    }
    return true;
  });
}

export interface AvailableFilters {
  sets: string[];
  rarities: Rarity[];
  types: string[];
  domains: string[];
  costMin: number;
  costMax: number;
}

export function getAvailableFilters(cards: Card[]): AvailableFilters {
  const sets = [...new Set(cards.map((c) => c.set))];
  const rarities = [...new Set(cards.map((c) => c.rarity))].sort(
    (a, b) => RARITY_ORDER[a] - RARITY_ORDER[b],
  ) as Rarity[];
  const types = [...new Set(cards.map((c) => c.type))].sort();
  const domains = [...new Set(cards.flatMap((c) => c.faction.split("/")))]
    .sort()
    .sort((a, b) => (a === "Colorless" ? 1 : b === "Colorless" ? -1 : 0));
  const costs = cards.map((c) => c.stats.cost);
  return {
    sets,
    rarities,
    types,
    domains,
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
      sorted.sort((a, b) => a.stats.cost - b.stats.cost || a.name.localeCompare(b.name));
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
