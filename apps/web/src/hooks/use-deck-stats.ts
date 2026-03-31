import type { CardType, Domain } from "@openrift/shared";
import { CARD_TYPE_ORDER, DOMAIN_ORDER } from "@openrift/shared";

import { useDeckBuilderStore } from "@/stores/deck-builder-store";

export interface DomainCount {
  domain: Domain;
  main: number;
  sideboard: number;
}

export type EnergyCostCount = { energy: string } & Partial<Record<Domain, number>>;

export interface TypeCount {
  type: CardType;
  main: number;
  sideboard: number;
}

export interface PowerCount {
  power: string;
  main: number;
  sideboard: number;
}

interface DeckStats {
  domainDistribution: DomainCount[];
  energyCurve: EnergyCostCount[];
  energyCurveDomains: Domain[];
  powerCurve: PowerCount[];
  typeBreakdown: TypeCount[];
  totalCards: number;
}

// Only main and sideboard are shown in stats (champion counts toward main)
const MAIN_ZONES = new Set(["main", "champion"]);
const SIDEBOARD_ZONE = "sideboard";

/**
 * Computes deck statistics from the current deck builder state.
 * Splits counts into main (includes champion) and sideboard.
 * Excludes overflow, legend, runes, and battlefield zones.
 * @returns The deck statistics.
 */
export function useDeckStats(): DeckStats {
  const cards = useDeckBuilderStore((state) => state.cards);

  const mainCards = cards.filter((card) => MAIN_ZONES.has(card.zone));
  const sideboardCards = cards.filter((card) => card.zone === SIDEBOARD_ZONE);

  // Domain distribution — a card with 2 domains counts for both
  const domainMain = new Map<string, number>();
  const domainSide = new Map<string, number>();
  for (const card of mainCards) {
    for (const domain of card.domains) {
      domainMain.set(domain, (domainMain.get(domain) ?? 0) + card.quantity);
    }
  }
  for (const card of sideboardCards) {
    for (const domain of card.domains) {
      domainSide.set(domain, (domainSide.get(domain) ?? 0) + card.quantity);
    }
  }
  const allDomains = new Set([...domainMain.keys(), ...domainSide.keys()]);
  const domainDistribution: DomainCount[] = DOMAIN_ORDER.filter((domain) =>
    allDomains.has(domain),
  ).map((domain) => ({
    domain,
    main: domainMain.get(domain) ?? 0,
    sideboard: domainSide.get(domain) ?? 0,
  }));

  // Energy curve — group by energy cost and domain, stacked by domain color
  const allCards = [...mainCards, ...sideboardCards];
  const energyByDomain = new Map<number, Map<Domain, number>>();
  for (const card of allCards) {
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

  // Power curve — group by exact power, sorted numerically
  const powerMain = new Map<number, number>();
  const powerSide = new Map<number, number>();
  for (const card of mainCards) {
    if (card.power !== null) {
      powerMain.set(card.power, (powerMain.get(card.power) ?? 0) + card.quantity);
    }
  }
  for (const card of sideboardCards) {
    if (card.power !== null) {
      powerSide.set(card.power, (powerSide.get(card.power) ?? 0) + card.quantity);
    }
  }
  const allPowerValues = [...new Set([...powerMain.keys(), ...powerSide.keys()])];
  const powerCurve: PowerCount[] = [];
  if (allPowerValues.length > 0) {
    const powerMin = Math.min(...allPowerValues);
    const powerMax = Math.max(...allPowerValues);
    for (let value = powerMin; value <= powerMax; value++) {
      powerCurve.push({
        power: String(value),
        main: powerMain.get(value) ?? 0,
        sideboard: powerSide.get(value) ?? 0,
      });
    }
  }

  // Type breakdown — exclude types with dedicated zones
  const excludedTypes = new Set(["Legend", "Rune", "Battlefield"]);
  const typeMain = new Map<string, number>();
  const typeSide = new Map<string, number>();
  for (const card of mainCards) {
    if (!excludedTypes.has(card.cardType)) {
      typeMain.set(card.cardType, (typeMain.get(card.cardType) ?? 0) + card.quantity);
    }
  }
  for (const card of sideboardCards) {
    if (!excludedTypes.has(card.cardType)) {
      typeSide.set(card.cardType, (typeSide.get(card.cardType) ?? 0) + card.quantity);
    }
  }
  const allTypes = new Set([...typeMain.keys(), ...typeSide.keys()]);
  const typeBreakdown: TypeCount[] = CARD_TYPE_ORDER.filter((type) => allTypes.has(type)).map(
    (type) => ({
      type,
      main: typeMain.get(type) ?? 0,
      sideboard: typeSide.get(type) ?? 0,
    }),
  );

  const totalCards =
    mainCards.reduce((sum, card) => sum + card.quantity, 0) +
    sideboardCards.reduce((sum, card) => sum + card.quantity, 0);

  return {
    domainDistribution,
    energyCurve,
    energyCurveDomains,
    powerCurve,
    typeBreakdown,
    totalCards,
  };
}
