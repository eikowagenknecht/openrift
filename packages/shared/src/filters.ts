import type { Card, CardFilters, Rarity, SearchField, SortOption } from "./types.js";
import { RARITY_ORDER, SEARCH_PREFIX_MAP } from "./types.js";

export interface ParsedSearchTerm {
  field: SearchField | null;
  text: string;
}

export function parseSearchTerms(raw: string): ParsedSearchTerm[] {
  const terms: ParsedSearchTerm[] = [];
  const regex = /(?:(id|[ndkta]):(?:"([^"]*)"|([\S]*)))|(?:"([^"]*)")|(\S+)/g;
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
    case "id": {
      return card.sourceId.toLowerCase().includes(lower);
    }
  }
}

export function getMarketPrice(card: Card): number | null {
  return card.price?.market ?? null;
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
          ? (["name", "cardText", "keywords", "tags", "artist", "id"] as SearchField[])
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
    if (filters.domains.length > 0 && !card.domains.some((d) => filters.domains.includes(d))) {
      return false;
    }
    if (
      filters.energyMin !== null &&
      (card.stats.energy === null || card.stats.energy < filters.energyMin)
    ) {
      return false;
    }
    if (
      filters.energyMax !== null &&
      (card.stats.energy === null || card.stats.energy > filters.energyMax)
    ) {
      return false;
    }
    if (
      filters.mightMin !== null &&
      (card.stats.might === null || card.stats.might < filters.mightMin)
    ) {
      return false;
    }
    if (
      filters.mightMax !== null &&
      (card.stats.might === null || card.stats.might > filters.mightMax)
    ) {
      return false;
    }
    if (
      filters.powerMin !== null &&
      (card.stats.power === null || card.stats.power < filters.powerMin)
    ) {
      return false;
    }
    if (
      filters.powerMax !== null &&
      (card.stats.power === null || card.stats.power > filters.powerMax)
    ) {
      return false;
    }
    if (filters.artVariants.length > 0 && !filters.artVariants.includes(card.artVariant)) {
      return false;
    }
    if (filters.finishes.length > 0 && !filters.finishes.includes(card.finish)) {
      return false;
    }
    if (filters.isSigned !== null && card.isSigned !== filters.isSigned) {
      return false;
    }
    if (filters.isPromo !== null && card.isPromo !== filters.isPromo) {
      return false;
    }
    if (filters.priceMin !== null || filters.priceMax !== null) {
      const price = getMarketPrice(card);
      if (price === null) {
        return false;
      }
      if (filters.priceMin !== null && price < filters.priceMin) {
        return false;
      }
      if (filters.priceMax !== null && price > filters.priceMax) {
        return false;
      }
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
  artVariants: string[];
  finishes: string[];
  energyMin: number;
  energyMax: number;
  mightMin: number;
  mightMax: number;
  powerMin: number;
  powerMax: number;
  priceMin: number;
  priceMax: number;
  hasSigned: boolean;
  hasPromo: boolean;
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
  const domains = [...new Set(cards.flatMap((c) => c.domains))]
    .sort()
    .sort((a, b) => (a === "Colorless" ? 1 : b === "Colorless" ? -1 : 0));
  const artVariants = [...new Set(cards.map((c) => c.artVariant))];
  const variantOrder = ["normal", "altart", "overnumbered"];
  artVariants.sort((a, b) => {
    const ai = variantOrder.indexOf(a);
    const bi = variantOrder.indexOf(b);
    return (ai === -1 ? variantOrder.length : ai) - (bi === -1 ? variantOrder.length : bi);
  });
  const finishes = [...new Set(cards.map((c) => c.finish))];
  const finishOrder = ["normal", "foil"];
  finishes.sort((a, b) => {
    const ai = finishOrder.indexOf(a);
    const bi = finishOrder.indexOf(b);
    return (ai === -1 ? finishOrder.length : ai) - (bi === -1 ? finishOrder.length : bi);
  });
  const energies = cards.map((c) => c.stats.energy).filter((v): v is number => v !== null);
  const mights = cards.map((c) => c.stats.might).filter((v): v is number => v !== null);
  const powers = cards.map((c) => c.stats.power).filter((v): v is number => v !== null);
  const prices = cards.map((c) => getMarketPrice(c)).filter((p): p is number => p !== null);
  return {
    sets,
    rarities,
    types,
    superTypes,
    domains,
    artVariants,
    finishes,
    energyMin: energies.length > 0 ? Math.min(...energies) : 0,
    energyMax: energies.length > 0 ? Math.max(...energies) : 0,
    mightMin: mights.length > 0 ? Math.min(...mights) : 0,
    mightMax: mights.length > 0 ? Math.max(...mights) : 0,
    powerMin: powers.length > 0 ? Math.min(...powers) : 0,
    powerMax: powers.length > 0 ? Math.max(...powers) : 0,
    priceMin: prices.length > 0 ? Math.floor(Math.min(...prices)) : 0,
    priceMax: prices.length > 0 ? Math.ceil(Math.max(...prices)) : 0,
    hasSigned: cards.some((c) => c.isSigned),
    hasPromo: cards.some((c) => c.isPromo),
  };
}

export function sortCards(cards: Card[], sortBy: SortOption): Card[] {
  const sorted = [...cards];
  switch (sortBy) {
    case "name": {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    }
    case "id": {
      sorted.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
      break;
    }
    case "energy": {
      sorted.sort((a, b) => {
        const ae = a.stats.energy;
        const be = b.stats.energy;
        if (ae === null && be === null) {
          return a.name.localeCompare(b.name);
        }
        if (ae === null) {
          return 1;
        }
        if (be === null) {
          return -1;
        }
        return ae - be || a.name.localeCompare(b.name);
      });
      break;
    }
    case "rarity": {
      sorted.sort(
        (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name),
      );
      break;
    }
    case "price": {
      sorted.sort((a, b) => {
        const pa = getMarketPrice(a);
        const pb = getMarketPrice(b);
        if (pa === null && pb === null) {
          return a.name.localeCompare(b.name);
        }
        if (pa === null) {
          return 1;
        }
        if (pb === null) {
          return -1;
        }
        return pa - pb || a.name.localeCompare(b.name);
      });
      break;
    }
  }
  return sorted;
}
