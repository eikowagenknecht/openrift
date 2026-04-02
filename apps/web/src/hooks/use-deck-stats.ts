import type { CardType, Domain } from "@openrift/shared";
import { CARD_TYPE_ORDER, DOMAIN_ORDER } from "@openrift/shared";

import { useDeckBuilderStore } from "@/stores/deck-builder-store";

export interface DomainCount {
  domain: Domain;
  count: number;
}

export type EnergyCostCount = { energy: string } & Partial<Record<Domain, number>>;

export type TypeCount = { type: CardType; total: number } & Partial<Record<Domain, number>>;

export type PowerCount = { power: string } & Partial<Record<Domain, number>>;

interface DeckStats {
  domainDistribution: DomainCount[];
  energyCurve: EnergyCostCount[];
  energyCurveDomains: Domain[];
  averageEnergy: number | null;
  powerCurve: PowerCount[];
  powerCurveDomains: Domain[];
  typeBreakdown: TypeCount[];
  typeBreakdownDomains: Domain[];
  totalCards: number;
}

// Stats cover only main deck cards (champion counts toward main)
const MAIN_ZONES = new Set(["main", "champion"]);

/**
 * Computes deck statistics from the current deck builder state.
 * Covers main deck cards only (includes champion zone).
 * Excludes overflow, sideboard, legend, runes, and battlefield zones.
 * @returns The deck statistics.
 */
export function useDeckStats(): DeckStats {
  const cards = useDeckBuilderStore((state) => state.cards);

  const mainCards = cards.filter((card) => MAIN_ZONES.has(card.zone));

  // Domain distribution — a card with 2 domains counts for both
  const domainCounts = new Map<string, number>();
  for (const card of mainCards) {
    for (const domain of card.domains) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + card.quantity);
    }
  }
  const domainDistribution: DomainCount[] = DOMAIN_ORDER.filter((domain) =>
    domainCounts.has(domain),
  ).map((domain) => ({
    domain,
    count: domainCounts.get(domain) ?? 0,
  }));

  // Energy curve — group by energy cost and domain, stacked by domain color
  const energyByDomain = new Map<number, Map<Domain, number>>();
  for (const card of mainCards) {
    if (card.energy === null) {
      continue;
    }
    let domainMap = energyByDomain.get(card.energy);
    if (!domainMap) {
      domainMap = new Map();
      energyByDomain.set(card.energy, domainMap);
    }
    for (const domain of card.domains) {
      domainMap.set(domain, (domainMap.get(domain) ?? 0) + card.quantity);
    }
  }
  const allEnergyValues = [...energyByDomain.keys()];
  const energyDomainSet = new Set<Domain>();
  for (const domainMap of energyByDomain.values()) {
    for (const domain of domainMap.keys()) {
      energyDomainSet.add(domain);
    }
  }
  const energyCurveDomains = DOMAIN_ORDER.filter((domain) => energyDomainSet.has(domain));
  const energyCurve: EnergyCostCount[] = [];
  if (allEnergyValues.length > 0) {
    const energyMin = Math.min(...allEnergyValues);
    const energyMax = Math.max(...allEnergyValues);
    for (let value = energyMin; value <= energyMax; value++) {
      const domainMap = energyByDomain.get(value);
      const entry: EnergyCostCount = { energy: String(value) };
      for (const domain of energyCurveDomains) {
        entry[domain] = domainMap?.get(domain) ?? 0;
      }
      energyCurve.push(entry);
    }
  }

  // Average energy cost (weighted by quantity)
  let energySum = 0;
  let energyCount = 0;
  for (const card of mainCards) {
    if (card.energy !== null) {
      energySum += card.energy * card.quantity;
      energyCount += card.quantity;
    }
  }
  const averageEnergy = energyCount > 0 ? energySum / energyCount : null;

  // Power curve — group by power and domain, stacked by domain color
  const powerByDomain = new Map<number, Map<Domain, number>>();
  for (const card of mainCards) {
    if (card.power === null) {
      continue;
    }
    let domainMap = powerByDomain.get(card.power);
    if (!domainMap) {
      domainMap = new Map();
      powerByDomain.set(card.power, domainMap);
    }
    for (const domain of card.domains) {
      domainMap.set(domain, (domainMap.get(domain) ?? 0) + card.quantity);
    }
  }
  const allPowerValues = [...powerByDomain.keys()];
  const powerDomainSet = new Set<Domain>();
  for (const domainMap of powerByDomain.values()) {
    for (const domain of domainMap.keys()) {
      powerDomainSet.add(domain);
    }
  }
  const powerCurveDomains = DOMAIN_ORDER.filter((domain) => powerDomainSet.has(domain));
  const powerCurve: PowerCount[] = [];
  if (allPowerValues.length > 0) {
    const powerMin = Math.min(...allPowerValues);
    const powerMax = Math.max(...allPowerValues);
    for (let value = powerMin; value <= powerMax; value++) {
      const domainMap = powerByDomain.get(value);
      const entry: PowerCount = { power: String(value) };
      for (const domain of powerCurveDomains) {
        entry[domain] = domainMap?.get(domain) ?? 0;
      }
      powerCurve.push(entry);
    }
  }

  // Type breakdown — exclude types with dedicated zones, stacked by domain color
  const excludedTypes = new Set(["Legend", "Rune", "Battlefield"]);
  const typeByDomain = new Map<string, Map<Domain, number>>();
  const typeTotal = new Map<string, number>();
  for (const card of mainCards) {
    if (excludedTypes.has(card.cardType)) {
      continue;
    }
    let domainMap = typeByDomain.get(card.cardType);
    if (!domainMap) {
      domainMap = new Map();
      typeByDomain.set(card.cardType, domainMap);
    }
    for (const domain of card.domains) {
      domainMap.set(domain, (domainMap.get(domain) ?? 0) + card.quantity);
    }
    typeTotal.set(card.cardType, (typeTotal.get(card.cardType) ?? 0) + card.quantity);
  }
  const typeDomainSet = new Set<Domain>();
  for (const domainMap of typeByDomain.values()) {
    for (const domain of domainMap.keys()) {
      typeDomainSet.add(domain);
    }
  }
  const typeBreakdownDomains = DOMAIN_ORDER.filter((domain) => typeDomainSet.has(domain));
  const allTypes = new Set(typeByDomain.keys());
  const typeBreakdown: TypeCount[] = CARD_TYPE_ORDER.filter((type) => allTypes.has(type)).map(
    (type) => {
      const domainMap = typeByDomain.get(type);
      const entry: TypeCount = { type, total: typeTotal.get(type) ?? 0 };
      for (const domain of typeBreakdownDomains) {
        entry[domain] = domainMap?.get(domain) ?? 0;
      }
      return entry;
    },
  );

  const totalCards = mainCards.reduce((sum, card) => sum + card.quantity, 0);

  return {
    domainDistribution,
    energyCurve,
    energyCurveDomains,
    averageEnergy,
    powerCurve,
    powerCurveDomains,
    typeBreakdown,
    typeBreakdownDomains,
    totalCards,
  };
}
