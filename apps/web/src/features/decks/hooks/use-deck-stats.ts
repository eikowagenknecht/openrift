import type { DeckZone, Domain } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import type {
  DomainCount,
  DomainCombo,
  EnergyCostCount,
  PowerCount,
  TypeCount,
} from "@/features/collections/lib/stat-types";
import { comboKey, sortCombos } from "@/features/collections/lib/stat-types";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { useEnumOrders } from "@/hooks/use-enums";

export type {
  DomainCount,
  DomainCombo,
  EnergyCostCount,
  PowerCount,
  TypeCount,
} from "@/features/collections/lib/stat-types";

interface DeckStats {
  domainDistribution: DomainCount[];
  energyCurve: EnergyCostCount[];
  energyCurveStacks: DomainCombo[];
  averageEnergy: number | null;
  powerCurve: PowerCount[];
  powerCurveStacks: DomainCombo[];
  averagePower: number | null;
  typeBreakdown: TypeCount[];
  typeBreakdownDomains: Domain[];
  totalCards: number;
}

const MAIN_ZONES = new Set<DeckZone>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

const EXCLUDED_CARD_TYPES = new Set<string>([
  WellKnown.cardType.LEGEND,
  WellKnown.cardType.RUNE,
  WellKnown.cardType.BATTLEFIELD,
]);

export function useDeckStats(cards: DeckBuilderCard[]): DeckStats {
  const { orders } = useEnumOrders();

  const mainCards = cards.filter((card) => MAIN_ZONES.has(card.zone));

  const domainCounts = new Map<string, number>();
  for (const card of mainCards) {
    for (const domain of card.domains) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + card.quantity);
    }
  }
  const domainDistribution: DomainCount[] = orders.domains
    .filter((domain) => domainCounts.has(domain))
    .map((domain) => ({
      domain,
      count: domainCounts.get(domain) ?? 0,
    }));

  const energyByCombo = new Map<number, Map<string, number>>();
  const energyComboSet = new Set<string>();
  for (const card of mainCards) {
    if (card.energy === null) {
      continue;
    }
    const key = comboKey(card.domains, orders.domains);
    energyComboSet.add(key);
    let comboMap = energyByCombo.get(card.energy);
    if (!comboMap) {
      comboMap = new Map();
      energyByCombo.set(card.energy, comboMap);
    }
    comboMap.set(key, (comboMap.get(key) ?? 0) + card.quantity);
  }
  const energyCurveStacks = sortCombos(energyComboSet, orders.domains);
  const allEnergyValues = [...energyByCombo.keys()];
  const energyCurve: EnergyCostCount[] = [];
  if (allEnergyValues.length > 0) {
    const energyMin = Math.min(...allEnergyValues);
    const energyMax = Math.max(...allEnergyValues);
    for (let value = energyMin; value <= energyMax; value++) {
      const comboMap = energyByCombo.get(value);
      const entry: EnergyCostCount = { energy: String(value) };
      for (const stack of energyCurveStacks) {
        entry[stack.key] = comboMap?.get(stack.key) ?? 0;
      }
      energyCurve.push(entry);
    }
  }

  let energySum = 0;
  let energyCount = 0;
  for (const card of mainCards) {
    if (card.energy !== null) {
      energySum += card.energy * card.quantity;
      energyCount += card.quantity;
    }
  }
  const averageEnergy = energyCount > 0 ? energySum / energyCount : null;

  const powerByCombo = new Map<number, Map<string, number>>();
  const powerComboSet = new Set<string>();
  for (const card of mainCards) {
    const power = card.power ?? 0;
    const key = comboKey(card.domains, orders.domains);
    powerComboSet.add(key);
    let comboMap = powerByCombo.get(power);
    if (!comboMap) {
      comboMap = new Map();
      powerByCombo.set(power, comboMap);
    }
    comboMap.set(key, (comboMap.get(key) ?? 0) + card.quantity);
  }
  const powerCurveStacks = sortCombos(powerComboSet, orders.domains);

  let powerSum = 0;
  let powerCount = 0;
  for (const card of mainCards) {
    powerSum += (card.power ?? 0) * card.quantity;
    powerCount += card.quantity;
  }
  const averagePower = powerCount > 0 ? powerSum / powerCount : null;

  const allPowerValues = [...powerByCombo.keys()];
  const powerCurve: PowerCount[] = [];
  if (allPowerValues.length > 0) {
    const powerMin = Math.min(...allPowerValues);
    const powerMax = Math.max(...allPowerValues);
    for (let value = powerMin; value <= powerMax; value++) {
      const comboMap = powerByCombo.get(value);
      const entry: PowerCount = { power: String(value) };
      for (const stack of powerCurveStacks) {
        entry[stack.key] = comboMap?.get(stack.key) ?? 0;
      }
      powerCurve.push(entry);
    }
  }

  // Multi-type cards count under each of their types, so totals can exceed the deck size.
  const typeByDomain = new Map<string, Map<Domain, number>>();
  const typeTotal = new Map<string, number>();
  for (const card of mainCards) {
    for (const cardType of card.cardTypes) {
      if (EXCLUDED_CARD_TYPES.has(cardType)) {
        continue;
      }
      let domainMap = typeByDomain.get(cardType);
      if (!domainMap) {
        domainMap = new Map();
        typeByDomain.set(cardType, domainMap);
      }
      for (const domain of card.domains) {
        domainMap.set(domain, (domainMap.get(domain) ?? 0) + card.quantity);
      }
      typeTotal.set(cardType, (typeTotal.get(cardType) ?? 0) + card.quantity);
    }
  }
  const typeDomainSet = new Set<Domain>();
  for (const domainMap of typeByDomain.values()) {
    for (const domain of domainMap.keys()) {
      typeDomainSet.add(domain);
    }
  }
  const typeBreakdownDomains = orders.domains.filter((domain) =>
    typeDomainSet.has(domain as Domain),
  ) as Domain[];
  const allTypes = new Set(typeByDomain.keys());
  const typeBreakdown: TypeCount[] = orders.cardTypes
    .filter((type) => allTypes.has(type))
    .map((type) => {
      const domainMap = typeByDomain.get(type);
      const entry: TypeCount = { type, total: typeTotal.get(type) ?? 0 };
      for (const domain of typeBreakdownDomains) {
        entry[domain] = domainMap?.get(domain) ?? 0;
      }
      return entry;
    });

  const totalCards = mainCards.reduce((sum, card) => sum + card.quantity, 0);

  return {
    domainDistribution,
    energyCurve,
    energyCurveStacks,
    averageEnergy,
    powerCurve,
    powerCurveStacks,
    averagePower,
    typeBreakdown,
    typeBreakdownDomains,
    totalCards,
  };
}
