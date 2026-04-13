import type {
  CompletionScopePreference,
  Domain,
  Marketplace,
  Printing,
  PriceLookup,
  SetListEntry,
} from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePrices } from "@/hooks/use-prices";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useStackedCopies } from "@/hooks/use-stacked-copies";
import { formatterForMarketplace } from "@/lib/format";
import type {
  DomainCombo,
  DomainCount,
  EnergyCostCount,
  PowerCount,
  TypeCount,
} from "@/lib/stat-types";
import { comboKey, sortCombos } from "@/lib/stat-types";
import { useDisplayStore } from "@/stores/display-store";

// ── Types ──────────────────────────────────────────────────────────────────

export type CompletionGroupBy = "set" | "domain" | "rarity" | "type";
export type CompletionCountMode = "cards" | "printings" | "copies";

export interface CompletionEntry {
  key: string;
  label: string;
  owned: number;
  total: number;
  percent: number;
  /** Only present for set grouping to separate main/supplemental. */
  setType?: "main" | "supplemental";
}

export interface PricedCard {
  name: string;
  printingId: string;
  price: number;
  setSlug: string;
  cardSlug: string;
  thumbnail?: string;
}

export interface CollectionStats {
  totalCopies: number;
  uniqueCards: number;
  uniquePrintings: number;
  totalPrintingsInGame: number;
  estimatedValue: number;
  unpricedCount: number;
  completionPercent: number;
  totalCardsInGame: number;
  cheapestPrinting: PricedCard | null;
  mostExpensivePrinting: PricedCard | null;
  domainDistribution: DomainCount[];
  energyCurve: EnergyCostCount[];
  energyCurveStacks: DomainCombo[];
  averageEnergy: number | null;
  powerCurve: PowerCount[];
  powerCurveStacks: DomainCombo[];
  averagePower: number | null;
  typeBreakdown: TypeCount[];
  typeBreakdownDomains: Domain[];
  formatPrice: (value?: number | null) => string;
  marketplace: Marketplace;
}

export interface CompletionData {
  entries: CompletionEntry[];
  groupBy: CompletionGroupBy;
  countMode: CompletionCountMode;
}

// ── Target copies per card type (for "copies" mode) ────────────────────────

/** Max copies of a card allowed in a deck, by card type. */
const COPIES_TARGET: Record<string, number> = {
  Legend: 1,
  Battlefield: 1,
};
const DEFAULT_COPIES_TARGET = 3;

function targetForType(cardType: string): number {
  return COPIES_TARGET[cardType] ?? DEFAULT_COPIES_TARGET;
}

// ── Completion computation ─────────────────────────────────────────────────

interface CompletionInput {
  stacks: StackedEntry[];
  scopedPrintings: Printing[];
  scope: CompletionScopePreference;
  sets: SetListEntry[];
  groupBy: CompletionGroupBy;
  countMode: CompletionCountMode;
  orders: {
    domains: readonly string[];
    rarities: readonly string[];
    cardTypes: readonly string[];
  };
}

/**
 * Computes completion entries for a given grouping and count mode.
 * @returns Sorted completion entries.
 */
export function computeCompletion(input: CompletionInput): CompletionEntry[] {
  "use memo";
  const { stacks, scopedPrintings, scope, sets, groupBy, countMode, orders } = input;

  // Filter owned stacks to only those matching the scope
  const scopedStacks = filterStacksByScope(stacks, scope);

  // Determine key order and label function
  const { keyOrder, labelFn, extraFn } = getGroupConfig(groupBy, sets, orders);

  // Build totals from scoped catalog
  const totalByKey = buildTotals(scopedPrintings, groupBy, countMode);

  // Build owned counts from scope-filtered stacks
  const ownedByKey = buildOwned(scopedStacks, groupBy, countMode);

  const entries = keyOrder
    .filter((key) => totalByKey.has(key))
    .map((key) => {
      const owned = ownedByKey.get(key) ?? 0;
      const total = totalByKey.get(key) ?? 0;
      return {
        key,
        label: labelFn(key),
        owned,
        total,
        percent: total > 0 ? (owned / total) * 100 : 0,
        ...extraFn?.(key),
      };
    });

  if (groupBy === "set") {
    return entries.toSorted((a, b) => {
      if (a.setType !== b.setType) {
        return a.setType === "main" ? -1 : 1;
      }
      return 0;
    });
  }

  return entries;
}

function getGroupConfig(
  groupBy: CompletionGroupBy,
  sets: SetListEntry[],
  orders: CompletionInput["orders"],
) {
  switch (groupBy) {
    case "set": {
      const setLabels = new Map(sets.map((set) => [set.id, set.name]));
      const setTypes = new Map(sets.map((set) => [set.id, set.setType]));
      return {
        keyOrder: sets.map((set) => set.id),
        labelFn: (key: string) => setLabels.get(key) ?? key,
        extraFn: (key: string) => ({ setType: setTypes.get(key) }) as Partial<CompletionEntry>,
      };
    }
    case "domain": {
      return {
        keyOrder: [...orders.domains],
        labelFn: (key: string) => key,
        extraFn: undefined,
      };
    }
    case "rarity": {
      return {
        keyOrder: [...orders.rarities],
        labelFn: (key: string) => key,
        extraFn: undefined,
      };
    }
    case "type": {
      return {
        keyOrder: [...orders.cardTypes],
        labelFn: (key: string) => key,
        extraFn: undefined,
      };
    }
  }
}

function getGroupKey(printing: Printing, groupBy: CompletionGroupBy): string[] {
  switch (groupBy) {
    case "set": {
      return [printing.setId];
    }
    case "domain": {
      return printing.card.domains;
    }
    case "rarity": {
      return [printing.rarity];
    }
    case "type": {
      return [printing.card.type];
    }
  }
}

function buildTotals(
  scopedPrintings: Printing[],
  groupBy: CompletionGroupBy,
  countMode: CompletionCountMode,
): Map<string, number> {
  if (countMode === "printings") {
    const result = new Map<string, number>();
    for (const printing of scopedPrintings) {
      for (const key of getGroupKey(printing, groupBy)) {
        result.set(key, (result.get(key) ?? 0) + 1);
      }
    }
    return result;
  }

  // "cards" and "copies" modes: count unique cards, optionally multiplied by target
  const cardsByKey = new Map<string, Set<string>>();
  const cardTypes = new Map<string, string>(); // slug -> type
  for (const printing of scopedPrintings) {
    const slug = printing.card.slug;
    cardTypes.set(slug, printing.card.type);
    for (const key of getGroupKey(printing, groupBy)) {
      getOrCreate(cardsByKey, key).add(slug);
    }
  }

  if (countMode === "cards") {
    return mapSetSize(cardsByKey);
  }

  // copies mode: sum targets per unique card
  const result = new Map<string, number>();
  for (const [key, slugs] of cardsByKey) {
    let total = 0;
    for (const slug of slugs) {
      total += targetForType(cardTypes.get(slug) ?? "");
    }
    result.set(key, total);
  }
  return result;
}

function buildOwned(
  stacks: StackedEntry[],
  groupBy: CompletionGroupBy,
  countMode: CompletionCountMode,
): Map<string, number> {
  if (countMode === "printings") {
    const ownedByKey = new Map<string, Set<string>>();
    for (const stack of stacks) {
      for (const key of getGroupKey(stack.printing, groupBy)) {
        getOrCreate(ownedByKey, key).add(stack.printingId);
      }
    }
    return mapSetSize(ownedByKey);
  }

  // "cards" mode: unique card slugs
  if (countMode === "cards") {
    const ownedByKey = new Map<string, Set<string>>();
    for (const stack of stacks) {
      for (const key of getGroupKey(stack.printing, groupBy)) {
        getOrCreate(ownedByKey, key).add(stack.printing.card.slug);
      }
    }
    return mapSetSize(ownedByKey);
  }

  // "copies" mode: sum min(total copies of card, target) per group key
  // First, aggregate total copies per card slug per group key
  const copiesByKeyAndSlug = new Map<string, Map<string, number>>();
  for (const stack of stacks) {
    for (const key of getGroupKey(stack.printing, groupBy)) {
      const slugMap = getOrCreate2(copiesByKeyAndSlug, key);
      const slug = stack.printing.card.slug;
      slugMap.set(slug, (slugMap.get(slug) ?? 0) + stack.copyIds.length);
    }
  }

  const result = new Map<string, number>();
  for (const [key, slugMap] of copiesByKeyAndSlug) {
    let owned = 0;
    for (const [slug, copies] of slugMap) {
      const target = targetForType(stackCardType(stacks, slug));
      owned += Math.min(copies, target);
    }
    result.set(key, owned);
  }
  return result;
}

function stackCardType(stacks: StackedEntry[], slug: string): string {
  for (const stack of stacks) {
    if (stack.printing.card.slug === slug) {
      return stack.printing.card.type;
    }
  }
  return "";
}

// ── Stats computation ──────────────────────────────────────────────────────

interface ComputeInput {
  stacks: StackedEntry[];
  totalCopies: number;
  sets: SetListEntry[];
  prices: PriceLookup;
  marketplace: Marketplace;
  orders: {
    domains: readonly string[];
    rarities: readonly string[];
    cardTypes: readonly string[];
  };
}

/**
 * Computes collection statistics from stacked copies and reference data.
 * Extracted as a pure function for testability.
 * @returns The full set of collection statistics.
 */
export function computeCollectionStats(input: ComputeInput): Omit<CollectionStats, "formatPrice"> {
  "use memo";
  const { stacks, totalCopies, sets, prices, marketplace, orders } = input;

  // ── Hero stats ─────────────────────────────────────────────────────────

  const uniqueCardSlugs = new Set<string>();
  const uniquePrintingIds = new Set<string>();
  let estimatedValue = 0;
  let unpricedCount = 0;
  let cheapestPrinting: PricedCard | null = null;
  let mostExpensivePrinting: PricedCard | null = null;

  for (const stack of stacks) {
    uniqueCardSlugs.add(stack.printing.card.slug);
    uniquePrintingIds.add(stack.printingId);
    const price = prices.get(stack.printingId, marketplace);
    if (price === undefined) {
      unpricedCount += stack.copyIds.length;
    } else {
      estimatedValue += price * stack.copyIds.length;
      if (price > 0 && (cheapestPrinting === null || price < cheapestPrinting.price)) {
        cheapestPrinting = {
          name: stack.printing.card.name,
          printingId: stack.printingId,
          price,
          setSlug: stack.printing.setSlug,
          cardSlug: stack.printing.card.slug,
          thumbnail: stack.printing.images[0]?.thumbnail,
        };
      }
      if (mostExpensivePrinting === null || price > mostExpensivePrinting.price) {
        mostExpensivePrinting = {
          name: stack.printing.card.name,
          printingId: stack.printingId,
          price,
          setSlug: stack.printing.setSlug,
          cardSlug: stack.printing.card.slug,
          thumbnail: stack.printing.images[0]?.thumbnail,
        };
      }
    }
  }

  const uniqueCards = uniqueCardSlugs.size;
  const uniquePrintings = uniquePrintingIds.size;
  const totalCardsInGame = sets.reduce((sum, set) => sum + set.cardCount, 0);
  const totalPrintingsInGame = sets.reduce((sum, set) => sum + set.printingCount, 0);
  const completionPercent = totalCardsInGame > 0 ? (uniqueCards / totalCardsInGame) * 100 : 0;

  // ── Domain distribution ────────────────────────────────────────────────

  const domainCounts = new Map<string, number>();
  for (const stack of stacks) {
    const quantity = stack.copyIds.length;
    for (const domain of stack.printing.card.domains) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + quantity);
    }
  }
  const domainDistribution: DomainCount[] = orders.domains
    .filter((domain) => domainCounts.has(domain))
    .map((domain) => ({ domain: domain as Domain, count: domainCounts.get(domain) ?? 0 }));

  // ── Energy curve ───────────────────────────────────────────────────────

  const energyByCombo = new Map<number, Map<string, number>>();
  const energyComboSet = new Set<string>();

  for (const stack of stacks) {
    const energy = stack.printing.card.energy;
    if (energy === null || energy === undefined) {
      continue;
    }
    const key = comboKey(stack.printing.card.domains, orders.domains);
    energyComboSet.add(key);
    let comboMap = energyByCombo.get(energy);
    if (!comboMap) {
      comboMap = new Map();
      energyByCombo.set(energy, comboMap);
    }
    comboMap.set(key, (comboMap.get(key) ?? 0) + stack.copyIds.length);
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
      for (const combo of energyCurveStacks) {
        entry[combo.key] = comboMap?.get(combo.key) ?? 0;
      }
      energyCurve.push(entry);
    }
  }

  let energySum = 0;
  let energyCount = 0;
  for (const stack of stacks) {
    const energy = stack.printing.card.energy;
    if (energy !== null && energy !== undefined) {
      energySum += energy * stack.copyIds.length;
      energyCount += stack.copyIds.length;
    }
  }
  const averageEnergy = energyCount > 0 ? energySum / energyCount : null;

  // ── Power curve ────────────────────────────────────────────────────────

  const powerByCombo = new Map<number, Map<string, number>>();
  const powerComboSet = new Set<string>();

  for (const stack of stacks) {
    const power = stack.printing.card.power;
    if (power === null || power === undefined) {
      continue;
    }
    const key = comboKey(stack.printing.card.domains, orders.domains);
    powerComboSet.add(key);
    let comboMap = powerByCombo.get(power);
    if (!comboMap) {
      comboMap = new Map();
      powerByCombo.set(power, comboMap);
    }
    comboMap.set(key, (comboMap.get(key) ?? 0) + stack.copyIds.length);
  }

  const powerCurveStacks = sortCombos(powerComboSet, orders.domains);

  let powerSum = 0;
  let powerCount = 0;
  for (const stack of stacks) {
    const power = stack.printing.card.power;
    if (power !== null && power !== undefined) {
      powerSum += power * stack.copyIds.length;
      powerCount += stack.copyIds.length;
    }
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
      for (const combo of powerCurveStacks) {
        entry[combo.key] = comboMap?.get(combo.key) ?? 0;
      }
      powerCurve.push(entry);
    }
  }

  // ── Type breakdown (chart) ─────────────────────────────────────────────

  const typeByDomain = new Map<string, Map<Domain, number>>();
  const typeTotal = new Map<string, number>();

  for (const stack of stacks) {
    const cardType = stack.printing.card.type;
    const quantity = stack.copyIds.length;

    let domainMap = typeByDomain.get(cardType);
    if (!domainMap) {
      domainMap = new Map();
      typeByDomain.set(cardType, domainMap);
    }
    for (const domain of stack.printing.card.domains) {
      domainMap.set(domain, (domainMap.get(domain) ?? 0) + quantity);
    }
    typeTotal.set(cardType, (typeTotal.get(cardType) ?? 0) + quantity);
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
    .filter((cardType) => allTypes.has(cardType))
    .map((cardType) => {
      const domainMap = typeByDomain.get(cardType);
      const entry: TypeCount = { type: cardType, total: typeTotal.get(cardType) ?? 0 };
      for (const domain of typeBreakdownDomains) {
        entry[domain] = domainMap?.get(domain) ?? 0;
      }
      return entry;
    });

  return {
    totalCopies,
    uniqueCards,
    uniquePrintings,
    totalPrintingsInGame,
    estimatedValue,
    unpricedCount,
    completionPercent,
    totalCardsInGame,
    cheapestPrinting,
    mostExpensivePrinting,
    domainDistribution,
    energyCurve,
    energyCurveStacks,
    averageEnergy,
    powerCurve,
    powerCurveStacks,
    averagePower,
    typeBreakdown,
    typeBreakdownDomains,
    marketplace,
  };
}

/**
 * Filters printings by scope criteria.
 * @returns Only the printings matching all active scope filters.
 */
export function filterByScope(printings: Printing[], scope: CompletionScopePreference): Printing[] {
  "use memo";
  const { languages, finishes, artVariants, promos } = scope;
  const hasLanguages = languages && languages.length > 0;
  const hasFinishes = finishes && finishes.length > 0;
  const hasArtVariants = artVariants && artVariants.length > 0;

  if (!hasLanguages && !hasFinishes && !hasArtVariants && !promos) {
    return printings;
  }

  return printings.filter((printing) => {
    if (hasLanguages && !languages.includes(printing.language)) {
      return false;
    }
    if (hasFinishes && !finishes.includes(printing.finish)) {
      return false;
    }
    if (hasArtVariants && !artVariants.includes(printing.artVariant)) {
      return false;
    }
    if (promos === "exclude" && printing.promoType !== null) {
      return false;
    }
    if (promos === "only" && printing.promoType === null) {
      return false;
    }
    return true;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function filterStacksByScope(
  stacks: StackedEntry[],
  scope: CompletionScopePreference,
): StackedEntry[] {
  const { languages, finishes, artVariants, promos } = scope;
  const hasLanguages = languages && languages.length > 0;
  const hasFinishes = finishes && finishes.length > 0;
  const hasArtVariants = artVariants && artVariants.length > 0;

  if (!hasLanguages && !hasFinishes && !hasArtVariants && !promos) {
    return stacks;
  }

  return stacks.filter((stack) => {
    const { printing } = stack;
    if (hasLanguages && !languages.includes(printing.language)) {
      return false;
    }
    if (hasFinishes && !finishes.includes(printing.finish)) {
      return false;
    }
    if (hasArtVariants && !artVariants.includes(printing.artVariant)) {
      return false;
    }
    if (promos === "exclude" && printing.promoType !== null) {
      return false;
    }
    if (promos === "only" && printing.promoType === null) {
      return false;
    }
    return true;
  });
}

function getOrCreate<V>(map: Map<string, Set<V>>, key: string): Set<V> {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  return set;
}

function getOrCreate2(map: Map<string, Map<string, number>>, key: string): Map<string, number> {
  let inner = map.get(key);
  if (!inner) {
    inner = new Map();
    map.set(key, inner);
  }
  return inner;
}

function mapSetSize(map: Map<string, Set<string>>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, set] of map) {
    result.set(key, set.size);
  }
  return result;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface CollectionStatsResult extends CollectionStats {
  allPrintings: Printing[];
  stacks: StackedEntry[];
  sets: SetListEntry[];
  orders: { domains: readonly string[]; rarities: readonly string[]; cardTypes: readonly string[] };
}

/**
 * Computes collection statistics for a single collection or all collections.
 * @returns Full stats including hero metrics, completion breakdowns, and charts.
 */
export function useCollectionStats(collectionId?: string): CollectionStatsResult {
  const { stacks, totalCopies } = useStackedCopies(collectionId);
  const { allPrintings } = useCards();
  const { data: setList } = useSuspenseQuery(publicSetListQueryOptions);
  const prices = usePrices();
  const { orders } = useEnumOrders();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "tcgplayer";

  const stats = computeCollectionStats({
    stacks,
    totalCopies,
    sets: setList.sets,
    prices,
    marketplace,
    orders,
  });

  return {
    ...stats,
    formatPrice: formatterForMarketplace(marketplace),
    allPrintings,
    stacks,
    sets: setList.sets,
    orders,
  };
}
