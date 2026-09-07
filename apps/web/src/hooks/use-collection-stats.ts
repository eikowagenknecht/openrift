import type {
  CardType,
  CompletionScopePreference,
  Domain,
  Marketplace,
  Printing,
  PriceLookup,
  SetListEntry,
} from "@openrift/shared";
import {
  COMPLETION_SCOPE_ARRAY_KEYS,
  COMPLETION_SCOPE_SCALAR_KEYS,
  WellKnown,
  getPlaysetSize,
  imageUrl,
  isStandardPrinting,
  legendDisplayName,
} from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { useCards } from "@/hooks/use-cards";
import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
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
  RarityCount,
  TypeCount,
} from "@/lib/stat-types";
import { comboKey, sortCombos } from "@/lib/stat-types";
import { useDisplayStore } from "@/stores/display-store";

export type CompletionGroupBy = "set" | "domain" | "rarity" | "type";
export type CompletionCountMode = "cards" | "printings" | "copies";

export interface CompletionEntry {
  key: string;
  label: string;
  owned: number;
  total: number;
  percent: number;
  setType?: "main" | "supplemental";
}

export const MAX_EXPENSIVE_PRINTINGS = 10;

export interface PricedCard {
  name: string;
  printingId: string;
  price: number;
  setSlug: string;
  cardSlug: string;
  thumbnail?: string;
  fullImage?: string;
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
  mostExpensivePrintings: PricedCard[];
  domainDistribution: DomainCount[];
  rarityDistribution: RarityCount[];
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

/** Delegates to the canonical playset rule in @openrift/shared; do not re-derive it here. */
function copiesTarget(card?: { types: CardType[]; keywords: readonly string[] }): number {
  return card ? getPlaysetSize(card.types, card.keywords) : 3;
}

const PLAYSET_EXEMPT_TYPES = new Set<string>([WellKnown.cardType.RUNE, "other"]);

export function countsInPlaysetMode(card?: { types: CardType[] }): boolean {
  return !card?.types.some((type) => PLAYSET_EXEMPT_TYPES.has(type));
}

interface CompletionInput {
  stacks: StackedEntry[];
  scopedPrintings: Printing[];
  scope: CompletionScopePreference;
  customTagAssignments?: CustomTagAssignments;
  sets: SetListEntry[];
  groupBy: CompletionGroupBy;
  countMode: CompletionCountMode;
  orders: {
    domains: readonly string[];
    rarities: readonly string[];
    cardTypes: readonly string[];
  };
  labels?: {
    domains: Record<string, string>;
    rarities: Record<string, string>;
    cardTypes: Record<string, string>;
  };
}

export function computeCompletion(input: CompletionInput): CompletionEntry[] {
  const { stacks, scopedPrintings, scope, sets, groupBy, countMode, orders, labels } = input;

  const scopedStacks = filterStacksByScope(stacks, scope, input.customTagAssignments);

  const { keyOrder, labelFn, extraFn } = getGroupConfig(groupBy, sets, orders, labels);

  const totalByKey = buildTotals(scopedPrintings, groupBy, countMode);

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
        return a.setType === WellKnown.setType.MAIN ? -1 : 1;
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
  labels: CompletionInput["labels"],
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
        labelFn: (key: string) => labels?.domains[key] ?? key,
        extraFn: undefined,
      };
    }
    case "rarity": {
      return {
        keyOrder: [...orders.rarities],
        labelFn: (key: string) => labels?.rarities[key] ?? key,
        extraFn: undefined,
      };
    }
    case "type": {
      return {
        keyOrder: [...orders.cardTypes],
        labelFn: (key: string) => labels?.cardTypes[key] ?? key,
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
      // Multi-type cards count in every type group, like domains.
      return printing.card.types;
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

  const cardsByKey = new Map<string, Set<string>>();
  const cardInfo = new Map<string, { types: CardType[]; keywords: string[] }>();
  for (const printing of scopedPrintings) {
    const slug = printing.card.slug;
    cardInfo.set(slug, { types: printing.card.types, keywords: printing.card.keywords });
    for (const key of getGroupKey(printing, groupBy)) {
      getOrCreate(cardsByKey, key).add(slug);
    }
  }

  if (countMode === "cards") {
    return mapSetSize(cardsByKey);
  }

  const result = new Map<string, number>();
  for (const [key, slugs] of cardsByKey) {
    let total = 0;
    for (const slug of slugs) {
      const card = cardInfo.get(slug);
      if (!countsInPlaysetMode(card)) {
        continue;
      }
      total += copiesTarget(card);
    }
    if (total > 0) {
      result.set(key, total);
    }
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

  if (countMode === "cards") {
    const ownedByKey = new Map<string, Set<string>>();
    for (const stack of stacks) {
      for (const key of getGroupKey(stack.printing, groupBy)) {
        getOrCreate(ownedByKey, key).add(stack.printing.card.slug);
      }
    }
    return mapSetSize(ownedByKey);
  }

  const copiesByKeyAndSlug = new Map<string, Map<string, number>>();
  for (const stack of stacks) {
    for (const key of getGroupKey(stack.printing, groupBy)) {
      const slugMap = getOrCreate2(copiesByKeyAndSlug, key);
      const slug = stack.printing.card.slug;
      slugMap.set(slug, (slugMap.get(slug) ?? 0) + stack.copyIds.length);
    }
  }

  const cardBySlug = indexCardsBySlug(stacks);
  const result = new Map<string, number>();
  for (const [key, slugMap] of copiesByKeyAndSlug) {
    let owned = 0;
    for (const [slug, copies] of slugMap) {
      const card = cardBySlug.get(slug);
      if (!countsInPlaysetMode(card)) {
        continue;
      }
      owned += Math.min(copies, copiesTarget(card));
    }
    result.set(key, owned);
  }
  return result;
}

/**
 * Every printing of a card shares the same types/keywords, so the first stack wins.
 * Indexing up front avoids an O(n²) rescan per group key on large collections.
 */
function indexCardsBySlug(
  stacks: StackedEntry[],
): Map<string, { types: CardType[]; keywords: string[] }> {
  const bySlug = new Map<string, { types: CardType[]; keywords: string[] }>();
  for (const stack of stacks) {
    const { card } = stack.printing;
    if (!bySlug.has(card.slug)) {
      bySlug.set(card.slug, { types: card.types, keywords: card.keywords });
    }
  }
  return bySlug;
}

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

export function computeCollectionStats(input: ComputeInput): Omit<CollectionStats, "formatPrice"> {
  const { stacks, totalCopies, sets, prices, marketplace, orders } = input;

  const uniqueCardSlugs = new Set<string>();
  const uniquePrintingIds = new Set<string>();
  let estimatedValue = 0;
  let unpricedCount = 0;
  const pricedStacks: { stack: StackedEntry; price: number }[] = [];

  for (const stack of stacks) {
    uniqueCardSlugs.add(stack.printing.card.slug);
    uniquePrintingIds.add(stack.printingId);
    const price = prices.get(stack.printingId, marketplace);
    if (price === undefined) {
      unpricedCount += stack.copyIds.length;
    } else {
      estimatedValue += price * stack.copyIds.length;
      if (price > 0) {
        pricedStacks.push({ stack, price });
      }
    }
  }

  const mostExpensivePrintings: PricedCard[] = pricedStacks
    .toSorted((a, b) => b.price - a.price)
    .slice(0, MAX_EXPENSIVE_PRINTINGS)
    .map(({ stack, price }) => {
      const firstImageId = stack.printing.images[0]?.imageId;
      return {
        name: legendDisplayName(stack.printing.card),
        printingId: stack.printingId,
        price,
        setSlug: stack.printing.setSlug,
        cardSlug: stack.printing.card.slug,
        thumbnail: firstImageId ? imageUrl(firstImageId, "400w") : undefined,
        fullImage: firstImageId ? imageUrl(firstImageId, "full") : undefined,
      };
    });

  const uniqueCards = uniqueCardSlugs.size;
  const uniquePrintings = uniquePrintingIds.size;
  const totalCardsInGame = sets.reduce((sum, set) => sum + set.cardCount, 0);
  const totalPrintingsInGame = sets.reduce((sum, set) => sum + set.printingCount, 0);
  const completionPercent = totalCardsInGame > 0 ? (uniqueCards / totalCardsInGame) * 100 : 0;

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

  const rarityCounts = new Map<string, number>();
  for (const stack of stacks) {
    const rarity = stack.printing.rarity;
    rarityCounts.set(rarity, (rarityCounts.get(rarity) ?? 0) + stack.copyIds.length);
  }
  const rarityDistribution: RarityCount[] = orders.rarities
    .filter((rarity) => rarityCounts.has(rarity))
    .map((rarity) => ({ rarity, count: rarityCounts.get(rarity) ?? 0 }));

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

  const typeByDomain = new Map<string, Map<Domain, number>>();
  const typeTotal = new Map<string, number>();

  // Multi-type cards count under each of their types, like the domain
  // breakdown, so totals can exceed the collection size.
  for (const stack of stacks) {
    const quantity = stack.copyIds.length;
    for (const cardType of stack.printing.card.types) {
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
    mostExpensivePrintings,
    domainDistribution,
    rarityDistribution,
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
 * Filters out printings whose set/language isn't released yet, unless already owned.
 * Release dates are per language, so a set's English printings can count while its French ones don't.
 */
export function excludeUnreleasedSets(input: {
  sets: SetListEntry[];
  printings: Printing[];
  stacks: StackedEntry[];
}): { sets: SetListEntry[]; printings: Printing[] } {
  const ownedKey = (setId: string, language: string) => `${setId}|${language}`;
  const owned = new Set(
    input.stacks.map((stack) => ownedKey(stack.printing.setId, stack.printing.language)),
  );
  const visiblePrintings = input.printings.filter(
    (printing) => printing.setReleased || owned.has(ownedKey(printing.setId, printing.language)),
  );
  if (visiblePrintings.length === input.printings.length) {
    return { sets: input.sets, printings: input.printings };
  }
  const visibleSetIds = new Set(visiblePrintings.map((printing) => printing.setId));
  return {
    sets: input.sets.filter((set) => visibleSetIds.has(set.id)),
    printings: visiblePrintings,
  };
}

/**
 * When false, filter functions return their input unchanged, preserving reference stability
 * for downstream memoization. An axis missing from the shared key lists would silently disable filtering.
 */
function scopeHasFilters(scope: CompletionScopePreference): boolean {
  return (
    COMPLETION_SCOPE_ARRAY_KEYS.some((key) => (scope[key] as string[] | undefined)?.length) ||
    COMPLETION_SCOPE_SCALAR_KEYS.some((key) => scope[key] !== undefined)
  );
}

function includesValue(allowed: string[] | undefined, value: string): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(value);
}

/** Any overlap passes; must match `overlaps` in the shared card filters. */
function overlapsValues(allowed: string[] | undefined, values: readonly string[]): boolean {
  return !allowed || allowed.length === 0 || values.some((value) => allowed.includes(value));
}

function notExcluded(excluded: string[] | undefined, value: string): boolean {
  return !excluded || excluded.length === 0 || !excluded.includes(value);
}

/** One excluded value rejects the card; must match `noneExcluded` in the shared card filters. */
function noneExcluded(excluded: string[] | undefined, values: readonly string[]): boolean {
  return !excluded || excluded.length === 0 || !values.some((value) => excluded.includes(value));
}

function matchesFlag(filter: boolean | undefined, actual: boolean): boolean {
  return filter === undefined || filter === actual;
}

function matchesPresence(state: "any" | "none" | undefined, has: boolean): boolean {
  return state === undefined || (state === "any" ? has : !has);
}

export function matchesScope(
  printing: Printing,
  scope: CompletionScopePreference,
  customTagSlugs: readonly string[] = [],
): boolean {
  const { card } = printing;
  const markerPresence = scope.promos && (scope.promos === "only" ? "any" : "none");
  return (
    includesValue(scope.sets, printing.setSlug) &&
    includesValue(scope.languages, printing.language) &&
    includesValue(scope.rarities, printing.rarity) &&
    includesValue(scope.finishes, printing.finish) &&
    includesValue(scope.artVariants, printing.artVariant) &&
    includesValue(scope.cardSizes, printing.size) &&
    overlapsValues(scope.domains, card.domains) &&
    overlapsValues(scope.types, card.types) &&
    overlapsValues(scope.keywords, card.keywords) &&
    overlapsValues(scope.tags, card.tags) &&
    overlapsValues(scope.customTags, customTagSlugs) &&
    notExcluded(scope.setsExclude, printing.setSlug) &&
    notExcluded(scope.languagesExclude, printing.language) &&
    notExcluded(scope.raritiesExclude, printing.rarity) &&
    notExcluded(scope.finishesExclude, printing.finish) &&
    notExcluded(scope.artVariantsExclude, printing.artVariant) &&
    noneExcluded(scope.domainsExclude, card.domains) &&
    noneExcluded(scope.typesExclude, card.types) &&
    noneExcluded(scope.keywordsExclude, card.keywords) &&
    noneExcluded(scope.tagsExclude, card.tags) &&
    noneExcluded(scope.customTagsExclude, customTagSlugs) &&
    matchesFlag(scope.standard, isStandardPrinting(printing)) &&
    matchesFlag(scope.signed, printing.isSigned) &&
    matchesFlag(scope.banned, card.bans.length > 0) &&
    matchesFlag(scope.errata, card.errata !== null) &&
    matchesPresence(markerPresence, printing.markers.length > 0) &&
    matchesPresence(scope.keywordsPresence, card.keywords.length > 0) &&
    matchesPresence(scope.tagsPresence, card.tags.length > 0) &&
    matchesPresence(scope.customTagsPresence, customTagSlugs.length > 0)
  );
}

export type CustomTagAssignments = Record<string, readonly string[]>;

export function filterByScope(
  printings: Printing[],
  scope: CompletionScopePreference,
  customTagAssignments?: CustomTagAssignments,
): Printing[] {
  if (!scopeHasFilters(scope)) {
    return printings;
  }
  return printings.filter((printing) =>
    matchesScope(printing, scope, customTagAssignments?.[printing.cardId]),
  );
}

export function filterStacksByScope(
  stacks: StackedEntry[],
  scope: CompletionScopePreference,
  customTagAssignments?: CustomTagAssignments,
): StackedEntry[] {
  if (!scopeHasFilters(scope)) {
    return stacks;
  }
  return stacks.filter((stack) =>
    matchesScope(stack.printing, scope, customTagAssignments?.[stack.printing.cardId]),
  );
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

export interface CollectionStatsResult extends CollectionStats {
  allPrintings: Printing[];
  stacks: StackedEntry[];
  sets: SetListEntry[];
  customTagAssignments: CustomTagAssignments;
  orders: { domains: readonly string[]; rarities: readonly string[]; cardTypes: readonly string[] };
  isReady: boolean;
}

/**
 * `scope` narrows every figure to the printings matching the page's active filters.
 * Pass the same scope as the completion/cost/value sections so they all answer the same question.
 */
export function useCollectionStats(
  collectionId?: string,
  scope?: CompletionScopePreference,
): CollectionStatsResult {
  const { stacks: allStacks, isReady } = useStackedCopies(collectionId);
  const { allPrintings } = useCards();
  const { data: setList } = useSuspenseQuery(publicSetListQueryOptions);
  const prices = usePrices();
  const { orders } = useEnumOrders();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  // Custom tags are assigned per card in the admin UI, not derived from the printing,
  // so the scope's custom-tag axes need this lookup.
  const customTagAssignments = useCustomTagAssignments();

  const stacks = scope ? filterStacksByScope(allStacks, scope, customTagAssignments) : allStacks;
  // totalCopies must reflect the scoped stacks; useStackedCopies's copy count is unscoped.
  const totalCopies = stacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);

  // Deliberately unscoped: unreleased-printing ownership is a catalog fact independent
  // of filters, and scoping it here would defeat getAvailableFilters's memoization.
  const { sets, printings } = excludeUnreleasedSets({
    sets: setList.sets,
    printings: allPrintings,
    stacks: allStacks,
  });

  const stats = computeCollectionStats({
    stacks,
    totalCopies,
    sets,
    prices,
    marketplace,
    orders,
  });

  return {
    ...stats,
    formatPrice: formatterForMarketplace(marketplace),
    allPrintings: printings,
    stacks,
    sets,
    orders,
    customTagAssignments,
    isReady,
  };
}
