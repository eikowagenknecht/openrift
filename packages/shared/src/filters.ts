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
      filters.superTypes.length > 0 &&
      !card.superTypes.some((st) => filters.superTypes.includes(st))
    ) {
      return false;
    }
    if (
      filters.domains.length > 0 &&
      !card.faction.split("/").some((d) => filters.domains.includes(d))
    ) {
      return false;
    }
    if (filters.energyMin !== null && card.stats.energy < filters.energyMin) {
      return false;
    }
    if (filters.energyMax !== null && card.stats.energy > filters.energyMax) {
      return false;
    }
    return true;
  });
}

export interface AvailableFilters {
  sets: string[];
  rarities: Rarity[];
  types: string[];
  superTypes: string[];
  domains: string[];
  energyMin: number;
  energyMax: number;
}

export function getAvailableFilters(cards: Card[]): AvailableFilters {
  const sets = [...new Set(cards.map((c) => c.set))];
  const rarities = [...new Set(cards.map((c) => c.rarity))].sort(
    (a, b) => RARITY_ORDER[a] - RARITY_ORDER[b],
  ) as Rarity[];
  const types = [...new Set(cards.map((c) => c.type))].sort();
  const superTypes = [...new Set(cards.flatMap((c) => c.superTypes))]
    .filter((st) => st !== "Basic")
    .sort();
  const domains = [...new Set(cards.flatMap((c) => c.faction.split("/")))]
    .sort()
    .sort((a, b) => (a === "Colorless" ? 1 : b === "Colorless" ? -1 : 0));
  const energies = cards.map((c) => c.stats.energy);
  return {
    sets,
    rarities,
    types,
    superTypes,
    domains,
    energyMin: Math.min(...energies),
    energyMax: Math.max(...energies),
  };
}

export function sortCards(cards: Card[], sortBy: SortOption): Card[] {
  const sorted = [...cards];
  switch (sortBy) {
    case "id": {
      sorted.sort((a, b) => a.id.localeCompare(b.id));
      break;
    }
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
    case "energy": {
      sorted.sort((a, b) => a.stats.energy - b.stats.energy || a.name.localeCompare(b.name));
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
