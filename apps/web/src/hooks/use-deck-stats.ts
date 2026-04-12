import type { Domain } from "@openrift/shared";

import { useEnumOrders } from "@/hooks/use-enums";
import type {
  DomainCount,
  DomainCombo,
  EnergyCostCount,
  PowerCount,
  TypeCount,
} from "@/lib/stat-types";
import { comboKey, sortCombos } from "@/lib/stat-types";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

export type {
  DomainCount,
  DomainCombo,
  EnergyCostCount,
  PowerCount,
  TypeCount,
} from "@/lib/stat-types";

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

// Stats cover only main deck cards (champion counts toward main)
const MAIN_ZONES = new Set(["main", "champion"]);

// Types with dedicated zones are excluded from the type breakdown chart
const EXCLUDED_CARD_TYPES = new Set(["Legend", "Rune", "Battlefield"]);

/**
 * Computes deck statistics from the current deck builder state.
 * Covers main deck cards only (includes champion zone).
 * Excludes overflow, sideboard, legend, runes, and battlefield zones.
 * @returns The deck statistics.
 */
export function useDeckStats(): DeckStats {
  const { orders } = useEnumOrders();
  const cards = useDeckBuilderStore((state) => state.cards);

  const mainCards = cards.filter((card) => MAIN_ZONES.has(card.zone));

  // Domain distribution — a card with 2 domains counts for both
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

  // Energy curve — group by energy cost and domain combo, stacked
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

  // Power curve — group by power and domain combo, stacked
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

  // Average power (weighted by quantity, treating null power as 0)
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

  // Type breakdown — exclude types with dedicated zones, stacked by domain color
  const typeByDomain = new Map<string, Map<Domain, number>>();
  const typeTotal = new Map<string, number>();
  for (const card of mainCards) {
    if (EXCLUDED_CARD_TYPES.has(card.cardType)) {
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
