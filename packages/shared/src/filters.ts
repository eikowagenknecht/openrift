import type { Card, CardFilters, Rarity, SearchField, SortOption } from "./types.js";
import { RARITY_ORDER, SEARCH_PREFIX_MAP } from "./types.js";

export interface ParsedSearchTerm {
  field: SearchField | null;
  text: string;
}

export function parseSearchTerms(raw: string): ParsedSearchTerm[] {
  const terms: ParsedSearchTerm[] = [];
  const regex = /(?:([ndkta]):(?:"([^"]*)"|([\S]*)))|(?:"([^"]*)")|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const prefix = match[1];
    if (prefix) {
      const text = (match[2] ?? match[3] ?? "").trim();
      if (text) {
        terms.push({ field: SEARCH_PREFIX_MAP[prefix] ?? null, text });
      }
    } else {
      const text = (match[4] ?? match[5] ?? "").trim();
      if (text) {
        terms.push({ field: null, text });
      }
    }
  }
  return terms;
}

function cardMatchesField(card: Card, field: SearchField, text: string): boolean {
  const lower = text.toLowerCase();
  switch (field) {
    case "name": {
      return card.name.toLowerCase().includes(lower);
    }
    case "cardText": {
      return (
        card.description.toLowerCase().includes(lower) || card.effect.toLowerCase().includes(lower)
      );
    }
    case "keywords": {
      return card.keywords.some((kw) => kw.toLowerCase().includes(lower));
    }
    case "tags": {
      return card.tags.some((tag) => tag.toLowerCase().includes(lower));
    }
    case "artist": {
      return card.art.artist.toLowerCase().includes(lower);
    }
  }
}

export function filterCards(cards: Card[], filters: CardFilters): Card[] {
  const terms = filters.search ? parseSearchTerms(filters.search) : [];
  const hasPrefixes = terms.some((t) => t.field !== null);

  return cards.filter((card) => {
    if (terms.length > 0) {
      const allMatch = terms.every((term) => {
        if (term.field) {
          return cardMatchesField(card, term.field, term.text);
        }
        // Un-prefixed: if any prefix present, search all fields; otherwise search active scope
        const fieldsToSearch = hasPrefixes
          ? (["name", "cardText", "keywords", "tags", "artist"] as SearchField[])
          : filters.searchScope;
        return fieldsToSearch.some((f) => cardMatchesField(card, f, term.text));
      });
      if (!allMatch) {
        return false;
      }
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
