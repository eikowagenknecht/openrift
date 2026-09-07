import type { BoundsAcc } from "./filters-shared.js";
import { bumpBounds, orderIndex, readBounds } from "./filters-shared.js";
import { orderSetsMainFirst } from "./set-order.js";
import { isStandardPrinting } from "./standard.js";
import type { DistributionChannel, Marker, Printing } from "./types/catalog.js";
import type { EnumOrders } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

export interface AvailableFilters {
  sets: string[];
  supplementalSets: ReadonlySet<string>;
  domains: string[];
  types: string[];
  superTypes: string[];
  rarities: string[];
  artVariants: string[];
  finishes: string[];
  cardSizes: string[];
  hasSigned: boolean;
  hasOvernumbered: boolean;
  hasNonStandard: boolean;
  hasBanned: boolean;
  hasErrata: boolean;
  hasNullEnergy: boolean;
  hasNullMight: boolean;
  hasNullPower: boolean;
  markers: Marker[];
  distributionChannels: DistributionChannel[];
  keywords: string[];
  tags: string[];
  energy: { min: number; max: number };
  might: { min: number; max: number };
  power: { min: number; max: number };
  price: { min: number; max: number };
}

interface GetAvailableFiltersOptions {
  /** Pass the live orders from `/api/enums` so admin re-ordering takes effect. */
  orders: EnumOrders;
  /** When omitted, sets appear in insertion order and `supplementalSets` is empty. */
  sets?: readonly { slug: string; setType?: string }[];
  /** Defaults to `() => undefined`, which yields a `{ min: 0, max: 0 }` price range. */
  getPrice?: (printing: Printing) => number | undefined;
  /**
   * When omitted, `distributionChannels` is derived from the printings' direct
   * channel links only, losing parent channels no printing links to directly.
   */
  channels?: readonly DistributionChannel[];
}

export function getAvailableFilters(
  printings: Printing[],
  options: GetAvailableFiltersOptions,
): AvailableFilters {
  const orders = options.orders;
  const getPrice = options.getPrice;
  const setMeta = options.sets;

  // One pass: the previous shape read `printings` ~20 times over (flatMaps,
  // some() scans, Math.min spreads), too slow for the first render of /cards.
  const setSlugs = new Set<string>();
  const domainSet = new Set<string>();
  const typeSet = new Set<string>();
  const superTypeSet = new Set<string>();
  const raritySet = new Set<string>();
  const artVariantSet = new Set<string>();
  const finishSet = new Set<string>();
  const cardSizeSet = new Set<string>();
  const keywordSet = new Set<string>();
  const tagSet = new Set<string>();
  // Later occurrences overwrite earlier ones, matching the Map-from-pairs build
  // these replaced.
  const markerBySlug = new Map<string, Marker>();
  const channelBySlug = new Map<string, DistributionChannel>();
  const energy = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  const might = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  const power = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  const price = { min: Infinity, max: -Infinity, any: false } as BoundsAcc;
  let hasSigned = false;
  let hasOvernumbered = false;
  let hasNonStandard = false;
  let hasBanned = false;
  let hasErrata = false;
  let hasNullEnergy = false;
  let hasNullMight = false;
  let hasNullPower = false;

  for (const printing of printings) {
    const { card } = printing;
    setSlugs.add(printing.setSlug);
    raritySet.add(printing.rarity);
    artVariantSet.add(printing.artVariant || WellKnown.artVariant.NORMAL);
    finishSet.add(printing.finish);
    cardSizeSet.add(printing.size);
    for (const domain of card.domains) {
      domainSet.add(domain);
    }
    for (const type of card.types) {
      typeSet.add(type);
    }
    for (const superType of card.superTypes) {
      superTypeSet.add(superType);
    }
    for (const keyword of card.keywords) {
      keywordSet.add(keyword);
    }
    for (const tag of card.tags) {
      tagSet.add(tag);
    }
    for (const marker of printing.markers) {
      markerBySlug.set(marker.slug, marker);
    }
    for (const link of printing.distributionChannels) {
      channelBySlug.set(link.channel.slug, link.channel);
    }
    if (printing.isSigned) {
      hasSigned = true;
    }
    if (printing.isOvernumbered) {
      hasOvernumbered = true;
    }
    if (!hasNonStandard && !isStandardPrinting(printing)) {
      hasNonStandard = true;
    }
    if (card.bans.length > 0) {
      hasBanned = true;
    }
    if (card.errata !== null) {
      hasErrata = true;
    }
    if (card.energy === null) {
      hasNullEnergy = true;
    } else {
      bumpBounds(energy, card.energy);
    }
    if (card.might === null) {
      hasNullMight = true;
    } else {
      bumpBounds(might, card.might);
    }
    if (card.power === null) {
      hasNullPower = true;
    } else {
      bumpBounds(power, card.power);
    }
    if (getPrice) {
      const value = getPrice(printing);
      if (value !== undefined) {
        bumpBounds(price, value);
      }
    }
  }

  const sets = [...setSlugs];
  if (setMeta) {
    const setSlugOrder = new Map(orderSetsMainFirst(setMeta).map((s, i) => [s.slug, i]));
    sets.sort((a, b) => (setSlugOrder.get(a) ?? Infinity) - (setSlugOrder.get(b) ?? Infinity));
  }
  const byOrder = (order: readonly string[]) => (a: string, b: string) =>
    orderIndex(order, a) - orderIndex(order, b);

  return {
    sets,
    supplementalSets: setMeta
      ? new Set(
          setMeta.filter((s) => s.setType === WellKnown.setType.SUPPLEMENTAL).map((s) => s.slug),
        )
      : new Set<string>(),
    domains: [...domainSet].sort(byOrder(orders.domains)),
    types: [...typeSet].sort(byOrder(orders.cardTypes)),
    superTypes: [...superTypeSet]
      .filter((st) => st !== WellKnown.superType.BASIC)
      .sort(byOrder(orders.superTypes)),
    rarities: [...raritySet].sort(byOrder(orders.rarities)),
    artVariants: [...artVariantSet].sort(byOrder(orders.artVariants)),
    finishes: [...finishSet].sort(byOrder(orders.finishes)),
    cardSizes: [...cardSizeSet].sort(byOrder(orders.cardSizes)),
    hasSigned,
    hasOvernumbered,
    hasNonStandard,
    hasBanned,
    hasErrata,
    hasNullEnergy,
    hasNullMight,
    hasNullPower,
    markers: [...markerBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    distributionChannels: (options.channels ?? [...channelBySlug.values()]).toSorted((a, b) =>
      a.slug.localeCompare(b.slug),
    ),
    keywords: [...keywordSet].sort((a, b) => a.localeCompare(b)),
    tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
    energy: readBounds(energy),
    might: readBounds(might),
    power: readBounds(power),
    price: readBounds(price),
  };
}
